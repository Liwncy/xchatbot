/**
 * `#` 快捷口令目录。加工具主要改这一个文件。
 *
 * 匹配顺序：
 * 1. 本地口令（#工具）
 * 2. 动词（#画图、#搜索…，更长的优先）
 * 3. 前缀玩法（#修仙*、#庄园*）
 * 4. 关键词表（#八字测算…，词在 keywords.ts）
 * 5. 其余交给规则库；对不上再由 unknown 插件回「没听懂」
 *
 * 每条口令：verbs/prefix → 哪台 MCP → 工具名 → 怎么填参 → 哪种出口。
 * 不写 server 就打 `cf`（自家 cf-mcp-tools）。加别人的服务：
 * 1. 下面 MCP_SERVERS 登记 url/token 的 env 键
 * 2. wrangler 配上这对绑定（token 用 secret）
 * 3. 口令上写 `server: '那个键'`
 * 返回形状和现有工具差太多时，再在 dispatch.ts 加 mapper。
 */
import {resolveBotId, resolveOwnerId} from '../../../core/bot.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';
import {matchXuanxueCommand, xuanxueText} from './keywords.js';

export type CallCtx = {
    command: string;
    verb: string;
    tail: string;
    message: IncomingMessage;
    env: Env;
};

export type ArgsResult =
    | {ok: true; args: Record<string, unknown>}
    | {ok: false; hint: string};

/** MCP 入口。地址和 token 只放 env，不要写进口令表。 */
export type McpServerDef = {
    urlEnv: string;
    tokenEnv?: string;
    fallbackUrl?: string;
};

export const MCP_SERVERS = {
    cf: {
        urlEnv: 'MCP_TOOLS_URL',
        tokenEnv: 'MCP_TOOLS_TOKEN',
        fallbackUrl: 'https://mcp.lwcfworker.dpdns.org/mcp',
    },
} as const satisfies Record<string, McpServerDef>;

export type McpServerId = keyof typeof MCP_SERVERS;
export type RouteServer = McpServerId | 'local';

/** 把 MCP 返回收成哪类框架回复，实现见 dispatch.ts。 */
export type MapperName =
    | 'text'
    | 'image'
    | 'video'
    | 'reply'
    | 'search'
    | 'poem'
    | 'ticket'
    | 'human-start'
    | 'human-status'
    | 'rule'
    | 'time'
    | 'json'
    | 'adventure'
    | 'video-job'
    | 'parse-video'
    | 'emoji'
    | 'voice';

type RouteBase = {
    /** 不写则打 `cf`。`local` 走本 Worker，不经过公共 MCP。 */
    server?: RouteServer;
    tool: string;
    ownerOnly?: boolean;
    fail: string;
    args: (ctx: CallCtx) => ArgsResult;
    map: MapperName;
};

export type VerbRoute = RouteBase & {verbs: string[]};
export type LocalRoute = {verbs: string[]; local: 'catalog'; ownerOnly?: boolean};
export type PrefixRoute = RouteBase & {prefix: string; helpRewrite?: [string, string]};
export type KeywordRoute = RouteBase & {match: (command: string) => boolean};
export type FallbackRoute = RouteBase;

export type MatchedRoute =
    | {kind: 'verb'; route: VerbRoute; verb: string; tail: string}
    | {kind: 'local'; route: LocalRoute; verb: string; tail: string}
    | {kind: 'prefix'; route: PrefixRoute; verb: string; tail: string}
    | {kind: 'keyword'; route: KeywordRoute; verb: string; tail: string}
    | {kind: 'fallback'; route: FallbackRoute; verb: string; tail: string};

function need(hint: string): ArgsResult {
    return {ok: false, hint};
}

function ok(args: Record<string, unknown>): ArgsResult {
    return {ok: true, args};
}

function gamePlatform(env: Env): string {
    return env.XIUXIAN_PLATFORM?.trim() || 'agbot';
}

export function isOwner(message: IncomingMessage, env: Env): boolean {
    const ownerId = resolveOwnerId(env, message.platform);
    return Boolean(ownerId && message.from.trim() === ownerId);
}

export function identityArgs(ctx: CallCtx): Record<string, string> {
    return {
        platform: gamePlatform(ctx.env),
        userId: ctx.message.from,
        userName: ctx.message.senderName ?? '',
        requestId: `${ctx.message.platform}:${ctx.message.messageId}`,
    };
}

function firstHttpUrl(text: string): string {
    const match = /https?:\/\/\S+/iu.exec(text);
    return match?.[0]?.replace(/[)\]}>，。！？,.]+$/u, '') ?? '';
}

function xmlTagText(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
    return match?.[1]?.replace(/<[^>]+>/gu, '').trim() ?? '';
}

function stripQuotedSenderPrefix(text: string): string {
    const separatorIndex = text.indexOf(':\n');
    if (separatorIndex <= 0 || separatorIndex > 80) return text;
    return text.slice(separatorIndex + 2).trim() || text;
}

/** 引用消息里能当口令参数的正文。不要用 quote.title，那是自己刚打的字。 */
export function quotedArgText(message: IncomingMessage): string {
    const raw = message.quote?.referContent?.trim() ?? '';
    if (!raw) return '';
    if (!raw.includes('<')) return stripQuotedSenderPrefix(raw);
    return xmlTagText(raw, 'title') || xmlTagText(raw, 'des') || xmlTagText(raw, 'desc');
}

function argText(ctx: CallCtx): string {
    return ctx.tail.trim() || quotedArgText(ctx.message);
}

function mediaUrl(message: IncomingMessage, tail: string): string {
    return firstHttpUrl(tail)
        || message.media?.publicUrl?.trim()
        || message.media?.url?.trim()
        || message.quote?.media?.publicUrl?.trim()
        || message.quote?.media?.url?.trim()
        || firstHttpUrl(message.quote?.title ?? '')
        || firstHttpUrl(message.quote?.referContent ?? '');
}

function md5Of(text: string): string {
    const match = /\b([0-9a-f]{32})\b/iu.exec(text.trim());
    return match?.[1]?.toLowerCase() ?? '';
}

function mediaMd5(message: IncomingMessage, tail: string): string {
    const fromMedia = message.media?.md5?.trim().toLowerCase()
        || message.quote?.media?.md5?.trim().toLowerCase()
        || '';
    if (/^[0-9a-f]{32}$/u.test(fromMedia)) return fromMedia;
    return md5Of(tail)
        || md5Of(message.quote?.referContent ?? '')
        || md5Of(message.rawXml ?? '');
}

function verifyTarget(message: IncomingMessage, env: Env): {id: string; name: string} {
    const botId = resolveBotId(env, message.platform);
    const other = (message.mentions ?? []).find((item) => item.id.trim() && item.id.trim() !== botId);
    if (other) return {id: other.id.trim(), name: other.name?.trim() || other.id.trim()};
    return {id: message.from.trim(), name: message.senderName?.trim() || message.from.trim()};
}

function ruleContext(message: IncomingMessage): Record<string, string> {
    return {
        from: message.from,
        senderName: message.senderName ?? '',
        messageId: message.messageId,
        roomId: message.room?.id ?? '',
    };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
    const text = raw.trim();
    if (!text.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function parsePairs(raw: string): Record<string, string> {
    const params: Record<string, string> = {};
    for (const part of raw.trim().split(/\s+/u).filter(Boolean)) {
        const split = part.indexOf('=');
        if (split <= 0) continue;
        const key = part.slice(0, split).trim();
        const value = part.slice(split + 1).trim();
        if (key && value) params[key] = value;
    }
    return params;
}

function promptArg(field: string, hint: string) {
    return (ctx: CallCtx): ArgsResult => {
        const text = argText(ctx);
        return text ? ok({[field]: text}) : need(hint);
    };
}

function drawArgs(ctx: CallCtx): ArgsResult {
    return promptArg('prompt', `画什么写后面，也可以先引用那条再发 #${ctx.verb}`)(ctx);
}

function voiceListArgs(ctx: CallCtx): ArgsResult {
    const parts = ctx.tail.split(/\s+/u).filter(Boolean);
    const last = parts.at(-1) ?? '';
    let page = 1;
    let query = ctx.tail.trim();
    if (parts.length && /^\d+$/u.test(last)) {
        page = Math.max(1, Number(last));
        query = parts.slice(0, -1).join(' ');
    }
    return ok({
        ...(query ? {query} : {}),
        ...(page > 1 ? {page} : {}),
    });
}

function speechArgs(ctx: CallCtx): ArgsResult {
    const quoted = quotedArgText(ctx.message);
    const tail = ctx.tail.trim();
    const parts = tail.split(/\s+/u).filter(Boolean);
    const voice = parts[0] ?? '';

    if (quoted && parts.length <= 1) {
        return voice
            ? ok({text: quoted, voice, fallbackText: quoted})
            : ok({text: quoted});
    }
    if (parts.length >= 2) {
        return ok({text: parts.slice(1).join(' '), voice, fallbackText: tail});
    }
    if (tail) return ok({text: tail});
    return need(`要念的字写后面，也可以先引用那条再发 #${ctx.verb}`);
}

function searchArgs(ctx: CallCtx): ArgsResult {
    return promptArg('query', `搜什么写后面，也可以先引用那条再发 #${ctx.verb}`)(ctx);
}

function imageUrlArgs(ctx: CallCtx): ArgsResult {
    const imageUrl = mediaUrl(ctx.message, ctx.tail);
    if (!imageUrl) return need('引用那张图，或把图链写在后面');
    return ok({imageUrl});
}

function videoPromptArgs(ctx: CallCtx): ArgsResult {
    const prompt = argText(ctx);
    if (!prompt) return need('镜头怎么走写后面，也可以先引用那条再发 #做视频');
    const imageUrl = mediaUrl(ctx.message, '');
    return ok(imageUrl ? {prompt, imageUrl} : {prompt});
}

function ticketArgs(ctx: CallCtx): ArgsResult {
    const parts = ctx.tail.split(/\s+/u).filter(Boolean);
    if (parts.length < 2) return need('出发和到达写后面，比如 #车票 上海 北京 明天');
    const [from, to, ...rest] = parts;
    const args: Record<string, unknown> = {from, to};
    for (const token of rest) {
        if (/^(今天|明天|后天|\d{4}-\d{2}-\d{2})$/u.test(token)) args.date = token;
        else if (/^(高铁|动车|普通)$/u.test(token)) args.trainType = token;
        else if (/^[GDCZTK]\d+/iu.test(token)) args.trainNumber = token.toUpperCase();
        else if (/^\d+$/u.test(token)) args.page = Number(token);
    }
    return ok(args);
}

function humanStartArgs(ctx: CallCtx): ArgsResult {
    const target = verifyTarget(ctx.message, ctx.env);
    const groupId = ctx.message.room?.id?.trim() ?? '';
    const vars: Record<string, string> = {
        name: target.name,
        receiver: groupId || target.id,
        clientKey: target.id,
    };
    if (groupId) vars.remind = target.id;
    return ok({action: 'start', replyId: 'golem-text', clientKey: target.id, vars});
}

function parseVideoArgs(ctx: CallCtx): ArgsResult {
    const text = argText(ctx);
    if (!text) return need('把分享口令或链接写后面，也可以先引用那条再发 #解析视频');
    return ok({text});
}

function emojiSaveArgs(ctx: CallCtx): ArgsResult {
    const imageUrl = mediaUrl(ctx.message, ctx.tail);
    const md5 = mediaMd5(ctx.message, ctx.tail);
    if (!imageUrl && !md5) return need('引用表情或把图链 / md5 写后面');
    return ok({
        ...(md5 ? {md5} : {}),
        ...(imageUrl ? {imgUrl: imageUrl} : {}),
        description: ctx.tail.replace(imageUrl, '').replace(md5, '').trim() || undefined,
    });
}

function ruleJsonArgs(field: 'rule' | 'both') {
    return (ctx: CallCtx): ArgsResult => {
        const parsed = parseJsonObject(ctx.tail);
        if (!parsed) return need('规则 JSON 贴在后面');
        if (field === 'both') {
            const rule = (parsed.rule as Record<string, unknown> | undefined) ?? parsed;
            const testParams = parsed.testParams as Record<string, string> | undefined;
            return ok({rule, testParams, context: ruleContext(ctx.message)});
        }
        return ok({rule: parsed});
    };
}

function ruleStatusArgs(status: 'active' | 'disabled' | 'testing') {
    return (ctx: CallCtx): ArgsResult => {
        if (!ctx.tail) return need('规则 id 写后面');
        return ok({ruleId: ctx.tail.split(/\s+/u)[0], status});
    };
}

function xiuxianActionArgs(ctx: CallCtx): ArgsResult {
    const text = ctx.command.trim();
    return ok({
        ...identityArgs(ctx),
        text,
        listHelp: text === '修仙' || text === '修仙帮助' || text === '修仙指令' || text === '修仙菜单',
    });
}

function manorActionArgs(ctx: CallCtx): ArgsResult {
    const text = ctx.command.trim();
    return ok({
        ...identityArgs(ctx),
        text,
        listHelp: text === '庄园' || text === '庄园帮助',
    });
}

function xuanxueArgs(ctx: CallCtx): ArgsResult {
    const command = ctx.command.trim();
    const text = xuanxueText(command);
    return ok({
        text,
        listHelp: command === '玄学' || command === '玄学帮助' || command === '玄学指令',
    });
}

function peerScopeOf(message: IncomingMessage): string {
    return message.source === 'group'
        ? `group:${message.room?.id ?? ''}`
        : `user:${message.from}`;
}

function peerPersonOf(ctx: CallCtx): {wxid: string; name: string} | null {
    const botId = resolveBotId(ctx.env, ctx.message.platform);
    const other = (ctx.message.mentions ?? []).find((item) => item.id.trim() && item.id.trim() !== botId);
    if (other) return {wxid: other.id.trim(), name: other.name?.trim() || other.id.trim()};
    const quote = ctx.message.quote;
    const from = quote?.referFrom?.trim() ?? '';
    if (from && from !== botId) {
        return {wxid: from, name: quote?.referSenderName?.trim() || from};
    }
    return null;
}

function peerTalkArgs(ctx: CallCtx): ArgsResult {
    const person = peerPersonOf(ctx);
    if (!person) return need('先点名或引用他');
    const topic = ctx.tail.replace(/^会/u, '').trim();
    if (!topic) return need('他会啥写后面，比如 #记他 点歌');
    return ok({
        scope: peerScopeOf(ctx.message),
        wxid: person.wxid,
        name: person.name,
        topic,
        fallback: topic === '兜底',
        platform: ctx.message.platform,
    });
}

function peerShoutArgs(ctx: CallCtx): ArgsResult {
    const person = peerPersonOf(ctx);
    if (!person) return need('先点名或引用他');
    const tail = ctx.tail.trim();
    if (!tail) return need('口令写后面，比如 #记口令 点歌 music {问}');
    const parts = tail.split(/\s+/u).filter(Boolean);
    const topic = (parts[0] ?? '').replace(/^会/u, '');
    const template = parts.slice(1).join(' ') || topic;
    if (!topic) return need('会啥和口令写后面');
    return ok({
        scope: peerScopeOf(ctx.message),
        wxid: person.wxid,
        name: person.name,
        topic,
        template,
        platform: ctx.message.platform,
    });
}

function peerSearchArgs(ctx: CallCtx): ArgsResult {
    return ok({
        scope: peerScopeOf(ctx.message),
        query: ctx.tail.trim(),
    });
}

function peerMatchArgs(ctx: CallCtx): ArgsResult {
    const query = argText(ctx);
    if (!query) return need('要甩的事写后面');
    return ok({
        scope: peerScopeOf(ctx.message),
        query,
        platform: ctx.message.platform,
    });
}

function peerBanArgs(ctx: CallCtx): ArgsResult {
    const person = peerPersonOf(ctx);
    const topic = ctx.tail.replace(/^会/u, '').trim();
    if (!person && !topic) return need('点名他，或把会啥写后面');
    return ok({
        scope: peerScopeOf(ctx.message),
        wxid: person?.wxid,
        topic: topic || undefined,
    });
}

/** 动词口令。更长的优先，所以「修仙探索」不会被前缀「修仙」吃掉。 */
export const VERBS: VerbRoute[] = [
    // 图 / 语音 / 视频
    {verbs: ['画图'], tool: 'draw_image', fail: '没画成，再试下', args: drawArgs, map: 'image'},
    {verbs: ['快画'], tool: 'draw_image_fast', fail: '没画成，再试下', args: drawArgs, map: 'image'},
    {verbs: ['朗读'], tool: 'synthesize_speech', fail: '没念出来，再试下', args: speechArgs, map: 'voice'},
    {verbs: ['音色'], tool: 'list_speech_voices', fail: '音色没查到', args: voiceListArgs, map: 'reply'},
    {verbs: ['识图'], tool: 'recognize_image', fail: '没认出来，再试下', args: imageUrlArgs, map: 'json'},
    {verbs: ['做视频'], tool: 'submit_agnes_video', fail: '没交出去，再试下', args: videoPromptArgs, map: 'video-job'},
    {verbs: ['查视频'], tool: 'query_agnes_video', fail: '还没做好', args: (ctx) => ctx.tail ? ok({videoId: ctx.tail.split(/\s+/u)[0]}) : need('把视频 id 写后面，比如 #查视频 abcd'), map: 'video'},
    // 搜 / 热点
    {verbs: ['搜索'], tool: 'web_search', fail: '没搜到', args: searchArgs, map: 'search'},
    {verbs: ['热搜'], tool: 'trend_digest', fail: '热搜没查到', args: () => ok({}), map: 'json'},
    {verbs: ['搜热点'], tool: 'trend_search', fail: '热点里没找着', args: searchArgs, map: 'json'},
    {verbs: ['找话题'], tool: 'trend_chat_candidates', fail: '这会儿没合适话题', args: (ctx) => ok(ctx.tail ? {context: ctx.tail} : {}), map: 'json'},
    // 诗词 / 车票 / 目录
    {verbs: ['诗词'], tool: 'poetry_random', fail: '没抽到诗', args: (ctx) => ok(ctx.tail ? {author: ctx.tail} : {}), map: 'poem'},
    {verbs: ['飞花令'], tool: 'poetry_random', fail: '没抽到诗', args: (ctx) => {
        const text = argText(ctx);
        return text ? ok({char: [...text][0] ?? text}) : need('字写后面，也可以先引用那条再发 #飞花令');
    }, map: 'poem'},
    {verbs: ['搜诗'], tool: 'poetry_search', fail: '没找着诗', args: promptArg('q', '诗题、诗句或作者写后面，也可以先引用那条再发 #搜诗'), map: 'poem'},
    {verbs: ['车票'], tool: 'train_ticket_query', fail: '票没查成', args: ticketArgs, map: 'ticket'},
    {verbs: ['免费AI', '免费ai'], tool: 'free_ai_lookup', fail: '目录没查到', args: (ctx) => ok({query: ctx.tail || '免费 API'}), map: 'reply'},
    // 人机验证 / 好看 / 解析
    {verbs: ['人机验证', '是人吗'], tool: 'human_verify', fail: '没弄成，再试下', args: humanStartArgs, map: 'human-start'},
    {verbs: ['验证结果'], tool: 'human_verify', fail: '还没结果', args: (ctx) => ok({action: 'status', clientKey: verifyTarget(ctx.message, ctx.env).id}), map: 'human-status'},
    {verbs: ['好看图'], tool: 'fetch_haokan_image', fail: '图没取到', args: (ctx) => ctx.tail ? ok({query: ctx.tail}) : ok({listCategories: true}), map: 'image'},
    {verbs: ['好看视频'], tool: 'fetch_haokan_video', fail: '视频没取到', args: (ctx) => ctx.tail ? ok({query: ctx.tail}) : ok({listCategories: true}), map: 'video'},
    {verbs: ['随机图'], tool: 'fetch_yinguo_image', fail: '图没取到', args: (ctx) => ok({allowRaw: ctx.tail === '原图'}), map: 'image'},
    {verbs: ['解析视频'], tool: 'parse_short_video', fail: '这条解析不了', args: parseVideoArgs, map: 'parse-video'},
    // 表情 / 时间 / 回声
    {verbs: ['模型'], server: 'local', tool: 'llm_config', ownerOnly: true, fail: '没配成', args: (ctx) => ok({tail: ctx.tail}), map: 'json'},
    {verbs: ['搜表情'], server: 'local', tool: 'emoji_search', fail: '没找着', args: promptArg('query', '搜什么表情写后面，也可以先引用那条再发 #搜表情'), map: 'emoji'},
    {verbs: ['收藏表情'], server: 'local', tool: 'emoji_save', ownerOnly: true, fail: '没存上', args: emojiSaveArgs, map: 'emoji'},
    {verbs: ['取表情'], server: 'local', tool: 'emoji_get', fail: '没找着', args: (ctx) => {
        if (!ctx.tail) return need('名字或 md5 写后面');
        const md5 = md5Of(ctx.tail);
        return ok(md5 ? {md5} : {name: ctx.tail});
    }, map: 'emoji'},
    {verbs: ['改表情'], server: 'local', tool: 'emoji_update', ownerOnly: true, fail: '没改成', args: (ctx) => {
        const parts = ctx.tail.split(/\s+/u).filter(Boolean);
        if (parts.length < 2) return need('名字和新说明写后面，比如 #改表情 摊手 无奈');
        return ok({name: parts[0], description: parts.slice(1).join(' ')});
    }, map: 'json'},
    {verbs: ['重标表情', '补表情名'], server: 'local', tool: 'emoji_relabel', ownerOnly: true, fail: '没标成', args: () => ok({}), map: 'json'},
    {verbs: ['记他'], server: 'local', tool: 'peer_save', ownerOnly: true, fail: '没记下', args: peerTalkArgs, map: 'json'},
    {verbs: ['记口令'], server: 'local', tool: 'peer_save', ownerOnly: true, fail: '没记下', args: peerShoutArgs, map: 'json'},
    {verbs: ['搜能人', '花名册'], server: 'local', tool: 'peer_search', fail: '这群还没记谁', args: peerSearchArgs, map: 'json'},
    {verbs: ['转交', '甩活'], server: 'local', tool: 'peer_match', fail: '不会', args: peerMatchArgs, map: 'json'},
    {verbs: ['禁口令', '禁他'], server: 'local', tool: 'peer_ban', ownerOnly: true, fail: '没禁成', args: peerBanArgs, map: 'json'},
    {verbs: ['现在几点', '几点'], tool: 'get_current_time', fail: '这会儿对不上点', args: () => ok({}), map: 'time'},
    {verbs: ['回声'], tool: 'echo', ownerOnly: true, fail: '没回出来', args: (ctx) => {
        const text = argText(ctx);
        return text ? ok({message: text}) : need('要原样回去的字写后面，也可以先引用那条再发 #回声');
    }, map: 'text'},
    // 修仙探索（须排在前缀「修仙」之前）
    {verbs: ['修仙探索', '继续探索'], tool: 'xiuxian_adventure', fail: '这会儿没有在探的剧情', args: (ctx) => ok({action: 'status', ...identityArgs(ctx)}), map: 'adventure'},
    {verbs: ['修仙选'], tool: 'xiuxian_adventure', fail: '这会儿选不了', args: (ctx) => {
        const index = Number.parseInt(ctx.tail.replace(/^[选]/u, ''), 10);
        if (index < 1 || index > 4) return need('选项写成 #修仙选1 到 #修仙选4');
        return ok({action: 'choose', optionIndex: index, version: 0, ...identityArgs(ctx)});
    }, map: 'adventure'},
    // 规则库维护（主人）
    {verbs: ['规则搜索'], tool: 'rule_search', fail: '没搜到', args: (ctx) => ok({query: ctx.tail || undefined, includeInactive: ctx.tail.includes('含停用')}), map: 'json'},
    {verbs: ['规则运行'], tool: 'rule_run', fail: '没跑成', args: (ctx) => {
        const [ruleId, ...rest] = ctx.tail.split(/\s+/u).filter(Boolean);
        if (!ruleId) return need('规则 id 写后面，参数用 城市=北京');
        return ok({ruleId, params: parsePairs(rest.join(' ')), context: ruleContext(ctx.message)});
    }, map: 'rule'},
    {verbs: ['规则查询'], tool: 'rule_get', ownerOnly: true, fail: '没查到', args: (ctx) => ctx.tail ? ok({ruleId: ctx.tail.split(/\s+/u)[0]}) : need('规则 id 写后面'), map: 'json'},
    {verbs: ['规则校验'], tool: 'rule_validate', ownerOnly: true, fail: '没校完', args: ruleJsonArgs('rule'), map: 'json'},
    {verbs: ['规则测试'], tool: 'rule_test', ownerOnly: true, fail: '没测成', args: ruleJsonArgs('both'), map: 'json'},
    {verbs: ['规则入库'], tool: 'rule_auto_add', ownerOnly: true, fail: '没加上', args: ruleJsonArgs('both'), map: 'json'},
    {verbs: ['规则保存'], tool: 'rule_upsert', ownerOnly: true, fail: '没存上', args: ruleJsonArgs('rule'), map: 'json'},
    {verbs: ['规则启用'], tool: 'rule_set_status', ownerOnly: true, fail: '没改成', args: ruleStatusArgs('active'), map: 'json'},
    {verbs: ['规则停用'], tool: 'rule_set_status', ownerOnly: true, fail: '没改成', args: ruleStatusArgs('disabled'), map: 'json'},
    {verbs: ['规则删除'], tool: 'rule_delete', ownerOnly: true, fail: '没删掉', args: (ctx) => ctx.tail ? ok({ruleId: ctx.tail.split(/\s+/u)[0]}) : need('规则 id 写后面'), map: 'json'},
];

/** 不调 MCP，只列出能敲的动词。 */
export const LOCAL: LocalRoute[] = [
    {verbs: ['工具', '口令'], local: 'catalog'},
];

/** 整段玩法前缀。helpRewrite 只改帮助文案里的口令提示。 */
export const PREFIX: PrefixRoute[] = [
    {prefix: '修仙', tool: 'xiuxian_action', fail: '这招没使出来，等下再试', args: xiuxianActionArgs, map: 'text'},
    {
        prefix: '庄园',
        tool: 'manor_action',
        fail: '庄园这边卡了一下，等下再试',
        args: manorActionArgs,
        map: 'text',
        helpRewrite: ['「庄园帮助」', '「#庄园帮助」'],
    },
];

/** 关键词玩法：词表在 keywords.ts，按条挂到对应 MCP。 */
export const KEYWORDS: KeywordRoute[] = [
    {
        tool: 'xuanxue_query',
        fail: '这次没算出，再试下',
        match: matchXuanxueCommand,
        args: xuanxueArgs,
        map: 'text',
    },
];

/** 其余 `#` 交给规则库。对不上由 unknown 插件回「没听懂」。 */
export const FALLBACK: FallbackRoute = {
    tool: 'rule_execute',
    fail: '这次没弄成，再试下',
    args: (ctx) => ok({content: ctx.command, context: ruleContext(ctx.message)}),
    map: 'rule',
};
