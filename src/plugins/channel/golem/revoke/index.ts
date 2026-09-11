import type {IncomingMessage} from '../../../../core/message.js';
import type {PluginContext} from '../../../../core/context.js';
import {resolveChatId} from '../../../../core/context.js';
import {textReply, type HandlerResponse} from '../../../../core/reply.js';
import type {Plugin} from '../../../runtime/types.js';
import {buildRevokeParam, GolemApi} from '../../../../adapter/golem/api.js';
import {logger} from '../../../../utils/logger.js';

const HELP_COMMAND = '撤回帮助';
const NO_PERMISSION = '哼，你不配！';

function commandText(message: IncomingMessage): string {
    const content = message.content?.trim() ?? '';
    const quoteTitle = message.quote?.title?.trim() ?? '';
    return quoteTitle || content;
}

function matchesRevokeCommand(message: IncomingMessage): boolean {
    const content = message.content?.trim() ?? '';
    const text = commandText(message);
    if (content === HELP_COMMAND || text === HELP_COMMAND) return true;
    return /^撤回(?:\s+\d+)?$/u.test(content) || /^撤回(?:\s+\d+)?$/u.test(text);
}

function ensureOwner(from: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return '这个我还不能听你的';
    if (from.trim() !== owner) return NO_PERMISSION;
    return null;
}

function isQuotedBotMessage(message: IncomingMessage, ctx: PluginContext): boolean {
    const quote = message.quote;
    if (!quote) return false;
    const botId = ctx.env.BOT_WECHAT_ID?.trim() ?? '';
    const referFrom = quote.referFrom?.trim() ?? '';
    if (botId && referFrom && referFrom === botId) return true;
    const botName = ctx.env.BOT_WECHAT_NAME?.trim() ?? '';
    const referSenderName = quote.referSenderName?.trim() ?? '';
    return Boolean(botName && referSenderName && referSenderName === botName);
}

async function revokeQuoted(message: IncomingMessage, ctx: PluginContext): Promise<string> {
    if (!isQuotedBotMessage(message, ctx)) {
        return '只能撤我发的，别人的撤不了 🤔';
    }
    const referMessageId = message.quote?.referMessageId;
    if (!referMessageId?.newId) {
        return '引用里没带消息 id，撤不了 🤔';
    }
    const apiBaseUrl = ctx.env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) return '这会儿撤不了，等一下';

    const param = buildRevokeParam(
        resolveChatId(message),
        referMessageId.clientIdText ?? referMessageId.clientId,
        referMessageId.newIdText ?? referMessageId.newId,
        referMessageId.createTime,
    );
    if (!param) return '这条撤不了，引用信息不全 🤔';

    const result = await new GolemApi(apiBaseUrl).revokeMessage(param);
    if (result.code !== 0) {
        logger.warn('引用撤回失败', {
            code: result.code,
            message: result.message,
            receiver: param.receiver,
        });
        return '撤不了，太久了 😅';
    }
    return '嗯，这条撤了 👌';
}

export const revokePlugin: Plugin = {
    manifest: {
        name: 'wechat-revoke',
        platforms: ['golem'],
        kind: 'channel',
        priority: 10,
        impl: 'local',
    },
    match(message) {
        if (message.type !== 'text' && message.type !== 'link') return false;
        return matchesRevokeCommand(message);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        try {
            const ownerErr = ensureOwner(message.from, ctx.env.BOT_OWNER_WECHAT_ID);
            if (ownerErr) return textReply(ownerErr);

            const text = commandText(message);
            if (text === HELP_COMMAND || message.content?.trim() === HELP_COMMAND) {
                return textReply([
                    '撤我发的：',
                    '引用我发的那条，再发「撤回」',
                    '',
                    '按条数撤还没接上，先引用再撤',
                ].join('\n'));
            }

            if (!message.quote) {
                return textReply('先引用那条再撤');
            }
            return textReply(await revokeQuoted(message, ctx));
        } catch (error) {
            logger.error('撤回失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return textReply('没撤成，再试下');
        }
    },
};
