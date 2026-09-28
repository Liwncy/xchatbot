import {resolveOwnerId} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import type {IncomingMessage, MessageType} from '../../../core/message.js';
import {
    deleteDistributionRule,
    getDistributionRule,
    listDistributionRules,
    saveDistributionRule,
    setDistributionRuleStatus,
} from '../../../core/message-distribution/repository.js';
import {buildDistributionReplies} from '../../../core/message-distribution/transform.js';
import {
    DEFAULT_CONTENT_POLICY,
    type DistributionContentPolicy,
    type DistributionRule,
    type DistributionRuleInput,
    type DistributionTarget,
} from '../../../core/message-distribution/types.js';
import {textReply, type HandlerResponse, type ReplyMessage} from '../../../core/reply.js';
import type {PluginContext} from '../../../core/context.js';
import type {Plugin} from '../../runtime/types.js';
import {parseDistributionCommand, type DistributionCommand} from './parse.js';

const HELP = [
    '分发规则这样配：',
    '#分发规则 新增 名称=科技资讯 会话=gh_xxx 类型=文章 关键词=AI 内容=自动 目标=群:xxx',
    '#分发规则 内容 科技资讯 模式=AI 要求="压缩成100字" 输出=图文 失败=重建',
    '#分发规则 列表',
    '#分发规则 查看 科技资讯',
    '#分发规则 启用/停用/删除/测试 科技资讯',
].join('\n');

const TYPE_NAMES: Record<string, MessageType> = {
    文字: 'text',
    文本: 'text',
    文章: 'link',
    链接: 'link',
    图片: 'image',
    表情: 'emoji',
    语音: 'voice',
    视频: 'video',
};

function splitList(value?: string): string[] {
    return (value ?? '').split(/[,，]/u).map((item) => item.trim()).filter(Boolean);
}

function currentChatIds(message: IncomingMessage): string[] {
    return message.chatId ? [message.chatId] : [];
}

function parseChatIds(value: string | undefined, message: IncomingMessage): string[] {
    const entries = splitList(value);
    if (entries.length === 0 || entries.includes('当前')) return currentChatIds(message);
    if (entries.includes('全部')) return [];
    return [...new Set(entries.map((entry) => entry.replace(/^(?:公众号|群|私聊):/u, '').trim()).filter(Boolean))];
}

function parseTargets(value: string | undefined, message: IncomingMessage): DistributionTarget[] {
    const entries = splitList(value);
    if (entries.length === 0) throw new Error('还没写目标');
    return entries.map((entry) => {
        if (entry === '当前') {
            const id = message.chatId;
            if (!id) throw new Error('当前目标认不出来');
            return {platform: message.platform, kind: message.source === 'group' ? 'group' : 'user', id};
        }
        const platformMatch = entry.match(/^([\w-]+)\/([\s\S]+)$/u);
        const platform = platformMatch?.[1] ?? message.platform;
        const body = platformMatch?.[2] ?? entry;
        const targetMatch = body.match(/^(群|私聊):(.+)$/u);
        if (!targetMatch?.[2]?.trim()) throw new Error(`目标「${entry}」写法不对`);
        return {
            platform,
            kind: targetMatch[1] === '群' ? 'group' : 'user',
            id: targetMatch[2].trim(),
        };
    });
}

function requirePushTargets(targets: DistributionTarget[], ctx: PluginContext): void {
    const unavailable = targets.find((target) => {
        const adapter = target.platform === ctx.adapter?.platform
            ? ctx.adapter
            : ctx.resolveAdapter?.(target.platform);
        return !adapter?.supportsProactiveSend;
    });
    if (unavailable) throw new Error(`${unavailable.platform} 这边还不能主动分发`);
}

function parseMessageTypes(value?: string): MessageType[] {
    const values = splitList(value);
    if (values.length === 0 || values.includes('全部')) return [];
    return values.map((item) => {
        const type = TYPE_NAMES[item];
        if (!type) throw new Error(`还不认识「${item}」这种类型`);
        return type;
    });
}

function yes(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback;
    return !['否', '不', 'false', '0', '关'].includes(value.toLocaleLowerCase());
}

function policyFrom(
    values: Record<string, string>,
    current: DistributionContentPolicy = DEFAULT_CONTENT_POLICY,
): DistributionContentPolicy {
    const modeText = values.模式 ?? values.内容;
    const mode = modeText === '原样'
        ? 'original'
        : modeText === '重建'
            ? 'rebuild'
            : modeText === 'AI' || modeText?.toLocaleLowerCase() === 'ai'
                ? 'ai'
            : modeText === '自动'
                ? 'auto'
                : !modeText
                    ? current.mode
                    : null;
    if (!mode) throw new Error('模式用自动、原样、重建或 AI');
    const outputText = values.输出;
    const output = outputText === '纯文本' || outputText === '文本'
        ? 'text'
        : outputText === '图文' || outputText === '链接'
            ? 'link'
            : outputText === '媒体'
                ? 'media'
                : outputText === '自动'
                    ? 'auto'
                    : !outputText
                        ? current.output
                    : null;
    if (!output) throw new Error('输出用自动、纯文本、图文或媒体');
    const fallbackText = values.失败;
    const fallback = fallbackText === '纯文本' || fallbackText === '文本'
        ? 'text'
        : fallbackText === '跳过'
            ? 'skip'
            : fallbackText === '重建' || !fallbackText
                ? current.fallback
                : null;
    if (!fallback) throw new Error('失败时用重建、纯文本或跳过');
    return {
        ...current,
        mode,
        output,
        fallback,
        instruction: values.要求 ?? current.instruction,
        prefix: values.前缀 ?? current.prefix,
        suffix: values.后缀 ?? current.suffix,
        includeSource: yes(values.带来源, current.includeSource),
        includeSender: yes(values.带发送人, current.includeSender),
        includeOriginalUrl: yes(values.带原链接, current.includeOriginalUrl),
    };
}

function ruleInput(rule: DistributionRule): DistributionRuleInput {
    return {
        name: rule.name,
        status: rule.status,
        priority: rule.priority,
        chatIds: rule.chatIds,
        messageTypes: rule.messageTypes,
        keywords: rule.keywords,
        pattern: rule.pattern,
        targets: rule.targets,
        contentPolicy: rule.contentPolicy,
        continuePipeline: rule.continuePipeline,
    };
}

function ruleSummary(rule: DistributionRule): string {
    const chats = rule.chatIds.length ? rule.chatIds.join(',') : '全部';
    const targets = rule.targets.map((item) => `${item.platform}/${item.kind}:${item.id}`).join(',');
    const filters = [
        rule.messageTypes.length ? `类型=${rule.messageTypes.join(',')}` : '',
        rule.keywords.length ? `关键词=${rule.keywords.join(',')}` : '',
        rule.pattern ? `正则=${rule.pattern}` : '',
    ].filter(Boolean).join(' ');
    return [
        `${rule.status === 'active' ? '开着' : '停着'}｜${rule.name}`,
        `会话=${chats}${filters ? ` ${filters}` : ''}`,
        `内容=${rule.contentPolicy.mode} 输出=${rule.contentPolicy.output} 失败=${rule.contentPolicy.fallback}`,
        `目标=${targets}`,
    ].join('\n');
}

function previewText(replies: ReplyMessage[]): string {
    if (replies.length === 0) return '这条会被跳过';
    return replies.map((reply) => {
        if (reply.type === 'text') return `文字：${reply.content}`;
        if (reply.type === 'link') return `图文：${reply.title}\n${reply.desc ?? ''}\n${reply.url}`.trim();
        if (reply.type === 'forward') return '会按原样发';
        return `会发一条${reply.type}`;
    }).join('\n---\n');
}

function quotedMessage(message: IncomingMessage): IncomingMessage | null {
    const quote = message.quote;
    if (!quote) return null;
    const type: MessageType = quote.referType === 49
        ? 'link'
        : quote.referType === 3
            ? 'image'
            : quote.referType === 47
                ? 'emoji'
                : quote.referType === 34
                    ? 'voice'
                    : quote.referType === 43
                        ? 'video'
                        : 'text';
    return {
        ...message,
        type,
        messageId: `${message.messageId}:preview`,
        content: quote.title || quote.referContent,
        rawXml: quote.referContent?.includes('<') ? quote.referContent : undefined,
        media: quote.media,
        quote: undefined,
    };
}

async function applyCommand(
    command: DistributionCommand,
    message: IncomingMessage,
    ctx: PluginContext,
): Promise<string> {
    if (command.kind === 'help') return HELP;
    if (command.kind === 'list') {
        const rules = await listDistributionRules(ctx.env);
        return rules.length
            ? rules.map((rule) => `${rule.status === 'active' ? '开' : '停'}｜${rule.name}｜${rule.contentPolicy.mode}｜${rule.targets.length}处`).join('\n')
            : '还没配分发规则';
    }
    if (command.kind === 'show') {
        const rule = await getDistributionRule(ctx.env, command.name);
        return rule ? ruleSummary(rule) : '没找着这条规则';
    }
    if (command.kind === 'status') {
        const rule = await setDistributionRuleStatus(ctx.env, command.name, command.active ? 'active' : 'disabled');
        return rule ? `${rule.name}${command.active ? '开了' : '停了'} 👌` : '没找着这条规则';
    }
    if (command.kind === 'delete') {
        return await deleteDistributionRule(ctx.env, command.name) ? '删了' : '没找着这条规则';
    }
    if (command.kind === 'create') {
        const name = command.values.名称?.trim();
        if (!name) throw new Error('还没写名称');
        const priority = Number.parseInt(command.values.优先级 ?? '100', 10);
        const targets = parseTargets(command.values.目标, message);
        requirePushTargets(targets, ctx);
        const rule = await saveDistributionRule(ctx.env, {
            name,
            priority: Number.isFinite(priority) ? priority : 100,
            chatIds: parseChatIds(command.values.会话 ?? command.values.来源, message),
            messageTypes: parseMessageTypes(command.values.类型),
            keywords: splitList(command.values.关键词),
            pattern: command.values.正则,
            targets,
            contentPolicy: policyFrom(command.values),
            continuePipeline: yes(command.values.继续, true),
        });
        return `${rule.name}记下了，先开着 👌`;
    }
    if (command.kind === 'content') {
        if (!command.name) throw new Error('还没写规则名');
        const existing = await getDistributionRule(ctx.env, command.name);
        if (!existing) return '没找着这条规则';
        const saved = await saveDistributionRule(ctx.env, {
            ...ruleInput(existing),
            contentPolicy: policyFrom(command.values, existing.contentPolicy),
        });
        return `${saved.name}的内容方式改好了`;
    }
    const existing = await getDistributionRule(ctx.env, command.name);
    if (!existing) return '没找着这条规则';
    const quoted = quotedMessage(message);
    if (!quoted) return '引用一条消息再测';
    const replies = await buildDistributionReplies(ctx.env, quoted, existing);
    return previewText(replies);
}

export const messageDistributionCommandPlugin: Plugin = {
    manifest: {
        name: 'message-distribution-command',
        platforms: '*',
        kind: 'command',
        priority: 0,
        impl: 'local',
    },
    match(message, ctx) {
        const command = markedCommand(message, ctx.env);
        return command != null && parseDistributionCommand(command) != null;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = parseDistributionCommand(markedCommand(message, ctx.env) ?? '');
        if (!command) return null;
        const ownerId = resolveOwnerId(ctx.env, message.platform);
        if (!ownerId || message.senderId.trim() !== ownerId) return textReply('这事只有主人能改');
        try {
            return textReply(await applyCommand(command, message, ctx));
        } catch (error) {
            const messageText = error instanceof Error ? error.message : '';
            return textReply(/[\u3400-\u9fff]/u.test(messageText) ? messageText : '没配成，再试下');
        }
    },
};
