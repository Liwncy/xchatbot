/**
 * 把 `#` 口令对上目录、调 MCP、收成框架回复。
 *
 * 加工具改 catalog.ts。这里只负责走流程：
 * 匹配 → 主人校验 → 填参 → 按 server 调 MCP → 收成 HandlerResponse。
 * 适配器再按通道发出去，这里不碰微信发送细节。
 *
 * 规则库对不上时 map 会返回 null，交给后面的 unknown 插件回「没听懂」。
 */
import {callMcpTool, type McpToolResult} from '../../../mcp/client.js';
import {mapMcpResult} from '../../../mcp/map-result.js';
import {parseRepliesFromText} from '../../../core/outbound.js';
import {isHandledReply, textReply, type HandlerResponse, type ReplyMessage} from '../../../core/reply.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';
import {
    FALLBACK,
    identityArgs,
    isOwner,
    KEYWORDS,
    LOCAL,
    MCP_SERVERS,
    PREFIX,
    VERBS,
    type CallCtx,
    type MapperName,
    type MatchedRoute,
    type McpServerId,
} from './catalog.js';

type MapFn = (result: McpToolResult, ctx: CallCtx) => HandlerResponse;

// ── 匹配 ──────────────────────────────────────────────

/** 更长的动词优先。`#修仙选1` 这种数字可紧贴动词。 */
export function matchVerb(command: string, verbs: string[]): {verb: string; tail: string} | null {
    const text = command.trim();
    if (!text) return null;
    const ranked = [...verbs].sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh'));
    for (const verb of ranked) {
        if (text === verb) return {verb, tail: ''};
        if (!text.startsWith(verb)) continue;
        const rest = text.slice(verb.length);
        if (!rest || /^\s/u.test(rest) || /^[0-9]/u.test(rest)) {
            return {verb, tail: rest.trim()};
        }
        return {verb, tail: rest.trim()};
    }
    return null;
}

function resolveRoute(command: string): MatchedRoute | null {
    const text = command.trim();
    if (!text) return null;

    const localHit = matchVerb(text, LOCAL.flatMap((item) => item.verbs));
    if (localHit) {
        const route = LOCAL.find((item) => item.verbs.includes(localHit.verb));
        if (route) return {kind: 'local', route, ...localHit};
    }

    const verbHit = matchVerb(text, VERBS.flatMap((item) => item.verbs));
    if (verbHit) {
        const route = VERBS.find((item) => item.verbs.includes(verbHit.verb));
        if (route) return {kind: 'verb', route, ...verbHit};
    }

    const prefix = [...PREFIX]
        .sort((left, right) => right.prefix.length - left.prefix.length)
        .find((item) => text === item.prefix || text.startsWith(item.prefix));
    if (prefix) {
        return {kind: 'prefix', route: prefix, verb: prefix.prefix, tail: text.slice(prefix.prefix.length).trim()};
    }

    const keyword = KEYWORDS.find((item) => item.match(text));
    if (keyword) return {kind: 'keyword', route: keyword, verb: text, tail: ''};

    return {kind: 'fallback', route: FALLBACK, verb: text, tail: ''};
}

// ── 调 MCP ────────────────────────────────────────────

function envBinding(env: Env, key: string): string {
    const value = (env as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value.trim() : '';
}

function resolveMcpEndpoint(env: Env, server: McpServerId): {url: string; token?: string} | null {
    const def = MCP_SERVERS[server];
    if (!def) return null;
    const url = envBinding(env, def.urlEnv) || def.fallbackUrl || '';
    if (!url) return null;
    const token = def.tokenEnv ? envBinding(env, def.tokenEnv) : '';
    return token ? {url, token} : {url};
}

async function callServerMcp(
    env: Env,
    server: McpServerId,
    name: string,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const endpoint = resolveMcpEndpoint(env, server);
    if (!endpoint) throw new Error(`MCP server not configured: ${server}`);
    return callMcpTool(endpoint.url, {
        name,
        arguments: args,
    }, {token: endpoint.token});
}

// ── 收成 HandlerResponse ──────────────────────────────

function asRecord(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function clip(text: string, max = 1800): string {
    const raw = text.trim();
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max)}\n……后面略了`;
}

function pickUrl(raw: Record<string, unknown> | null, keys: string[]): string {
    if (!raw) return '';
    for (const key of keys) {
        const value = str(raw[key]);
        if (/^https?:\/\//iu.test(value)) return value;
    }
    return '';
}

function listNames(items: unknown, nameKeys: string[], limit = 8): string[] {
    if (!Array.isArray(items)) return [];
    const lines: string[] = [];
    for (const item of items.slice(0, limit)) {
        const row = asRecord(item);
        if (!row) continue;
        const name = nameKeys.map((key) => str(row[key])).find(Boolean);
        if (name) lines.push(name);
    }
    return lines;
}

function rewriteHelpHash(response: HandlerResponse, from: string, to: string): HandlerResponse {
    if (!response || isHandledReply(response)) return response;
    const rewrite = (item: ReplyMessage): ReplyMessage => {
        if (item.type !== 'text') return item;
        return textReply(item.content.replaceAll(from, to));
    };
    if (Array.isArray(response)) return response.map(rewrite);
    return rewrite(response);
}

const image: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const url = pickUrl(raw, ['url', 'imageUrl', 'image_url']);
    if (url) return parseRepliesFromText(`image:${url}`);
    return mapMcpResult(result, '没画成，再试下');
};

const video: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const status = str(raw?.status);
    if (status && status !== 'completed') return textReply('还没做好，过会再 #查视频');
    const url = pickUrl(raw, ['videoUrl', 'url', 'playUrl']);
    const cover = pickUrl(raw, ['coverUrl', 'cover', 'picUrl', 'thumbUrl']);
    if (url) return parseRepliesFromText(cover ? `video:${url}|${cover}` : `video:${url}`);
    const imageUrl = pickUrl(raw, ['imageUrl']);
    if (imageUrl) return parseRepliesFromText(`image:${imageUrl}`);
    return mapMcpResult(result, '没弄成，再试下');
};

const parseVideo: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const url = pickUrl(raw, ['videoUrl', 'url', 'playUrl']);
    const cover = pickUrl(raw, ['coverUrl', 'cover', 'picUrl']);
    const title = str(raw?.title);
    if (!url) return mapMcpResult(result, '这条解析不了');
    const replies = parseRepliesFromText(cover ? `video:${url}|${cover}` : `video:${url}`);
    return title ? [textReply(title), ...(Array.isArray(replies) ? replies : [replies])] : replies;
};

const videoJob: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const id = str(raw?.videoId) || str(raw?.id);
    if (id) return textReply(`交出去了，过会 #查视频 ${id}`);
    return mapMcpResult(result, '没交出去，再试下');
};

const reply: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const text = str(raw?.reply) || result.replyText || result.text;
    if (text) return parseRepliesFromText(text);
    return textReply('这次没查到');
};

const search: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const results = raw?.results ?? raw?.items;
    const lines = listNames(results, ['title'], 5).map((title, index) => {
        const row = asRecord(Array.isArray(results) ? results[index] : null);
        const url = pickUrl(row, ['url']);
        return url ? `${index + 1}. ${title}\n${url}` : `${index + 1}. ${title}`;
    });
    if (lines.length) return textReply(lines.join('\n\n'));
    return mapMcpResult(result, '没搜到');
};

const poem: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const poems = Array.isArray(raw?.poems) ? raw.poems : raw ? [raw] : [];
    const first = asRecord(poems[0]);
    if (!first) return mapMcpResult(result, '没找着诗');
    const title = str(first.title) || str(first.name);
    const author = str(first.author);
    const content = str(first.content) || str(first.paragraphs);
    const head = [title, author].filter(Boolean).join(' · ');
    return textReply(clip([head, content].filter(Boolean).join('\n')));
};

const ticket: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const trains = raw?.trains;
    if (!Array.isArray(trains) || trains.length === 0) return textReply('没查到符合条件的车次');
    const lines = trains.slice(0, 8).map((item) => {
        const row = asRecord(item);
        if (!row) return '';
        return [str(row.trainNumber) || str(row.number), str(row.from) || str(row.start), str(row.to) || str(row.end), str(row.startTime), str(row.duration)]
            .filter(Boolean)
            .join(' ');
    }).filter(Boolean);
    return textReply(lines.join('\n') || '没查到符合条件的车次');
};

const humanStart: MapFn = (result) => {
    const raw = asRecord(result.raw);
    if (str(raw?.status) === 'error') return textReply('没弄成，再试下');
    const url = pickUrl(raw, ['url']);
    if (!url) return textReply('没弄成，再试下');
    const name = str(raw?.targetName);
    const title = str(raw?.title) || '你是人类吗？';
    const description = str(raw?.description) || '三分钟内点开，证明下自己是人';
    const pic = pickUrl(raw, ['picUrl']);
    const hello = name ? `${name}，来证明下自己是人，三分钟哈` : '来证明下自己是人，三分钟哈';
    return [textReply(hello), ...parseRepliesFromText(`link:${title}|${description}|${url}|${pic}`)];
};

const humanStatus: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const status = str(raw?.status);
    if (status === 'human') return textReply('是人');
    if (status === 'bot' || status === 'expired') return textReply('不是人类');
    if (status === 'pending') return textReply('还在等他点');
    if (status === 'empty') return textReply('还没做过');
    return textReply('这会儿还没结果');
};

const time: MapFn = (result) => {
    const iso = result.text?.trim() || '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return textReply('这会儿对不上点');
    const text = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date).replace(/\//gu, '-');
    return textReply(`现在 ${text}`);
};

const adventure: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const message = str(raw?.message) || str(raw?.text);
    if (message) return textReply(message);
    const status = str(raw?.status);
    if (status === 'none') return textReply('这会儿没有在探的剧情');
    const step = raw?.currentStep;
    const total = raw?.totalSteps;
    if (step && total) return textReply(`探到 ${step}/${total} 了`);
    return mapMcpResult(result, '这会儿没有在探的剧情');
};

const emoji: MapFn = (result) => {
    const raw = asRecord(result.raw);
    const items = raw?.items ?? raw?.results ?? (raw?.found === false ? [] : raw ? [raw] : []);
    const first = asRecord(Array.isArray(items) ? items[0] : items);
    if (!first) return textReply('没找着');
    const md5 = str(first.md5);
    const url = pickUrl(first, ['imageUrl', 'url']);
    if (md5) return parseRepliesFromText(url ? `emoji:${md5}|${url}` : `emoji:${md5}`);
    if (url) return parseRepliesFromText(`image:${url}`);
    return textReply(str(first.name) || '好了');
};

const json: MapFn = (result) => {
    const raw = asRecord(result.raw);
    if (!raw) return mapMcpResult(result, '这次没弄成，再试下');
    if (raw.found === false) return textReply('没找着这条');
    if (raw.deleted === false) return textReply('没删掉');
    if (raw.updated === false) return textReply('没改成');
    if (raw.saved === false) return textReply('没存上');
    const spoken = str(raw.result) || str(raw.reply) || str(raw.message);
    if (spoken && raw.total == null && raw.rules == null) return textReply(clip(spoken));
    for (const key of ['items', 'topics', 'list', 'candidates', 'hits', 'results', 'platforms']) {
        const names = listNames(raw[key], ['title', 'name', 'query', 'word', 'text']);
        if (names.length) return textReply(names.join('\n'));
    }
    const total = raw.total;
    if (typeof total === 'number') {
        const names = listNames(raw.rules, ['name', 'id'], 8);
        if (!names.length) return textReply('没搜到');
        return textReply(`找到 ${total} 条：\n${names.join('\n')}`);
    }
    const id = str(raw.ruleId) || str(asRecord(raw.rule)?.id);
    if (raw.saved === true) return textReply(id ? `记下了，还是测试中：${id}` : '记下了，还是测试中');
    if (raw.updated === true) return textReply(id ? `改好了：${id}` : '改好了');
    if (raw.deleted === true) return textReply(id ? `删了：${id}` : '删了');
    if (raw.found === true) return textReply(id ? `在，id 是 ${id}` : '在');
    if (raw.valid === false) return textReply('这份规则过不了');
    if (raw.valid === true) return textReply('这份能过');
    return textReply(clip(JSON.stringify(raw)));
};

/** 规则库：对不上返回 null，让 unknown 插件接手。 */
function mapRuleExecute(result: McpToolResult): HandlerResponse {
    type RuleParam = {name?: string; description?: string};
    type RuleMeta = {
        title?: string;
        description?: string;
        picUrl?: string;
        voiceFormat?: number;
        voiceDurationMs?: number;
        appType?: number;
    };
    type RuleRaw = {
        matched?: boolean;
        missingParams?: RuleParam[];
        kind?: string;
        value?: string;
        error?: string;
        meta?: RuleMeta;
    };

    const raw = asRecord(result.raw) as RuleRaw | null;
    if (!raw || raw.matched === false) return null;
    if (raw.missingParams?.length) {
        const need = raw.missingParams
            .map((item) => item.description?.trim() || item.name?.trim())
            .filter(Boolean)
            .join('、');
        return textReply(need ? `还差${need}，补上再发一遍` : '还缺点东西，补上再发一遍');
    }
    if (raw.error) return textReply('这次没弄成，再试下');

    const kind = raw.kind;
    const value = (raw.value ?? '').trim();
    const meta = raw.meta;
    if (/^(image|video|audio|voice|link|music|emoji|app):/iu.test(value)) {
        return parseRepliesFromText(value);
    }
    if (!value && kind !== 'app') return textReply('这次没弄成，再试下');
    if (kind === 'image') return parseRepliesFromText(`image:${value}`);
    if (kind === 'video') return parseRepliesFromText(`video:${value}`);
    if (kind === 'voice') {
        const seconds = meta?.voiceDurationMs == null ? '' : String(Math.round(meta.voiceDurationMs / 1000));
        const format = meta?.voiceFormat == null ? '' : String(meta.voiceFormat);
        return parseRepliesFromText(`audio:${value}|${seconds}|${format}`);
    }
    if (kind === 'link') {
        const title = meta?.title?.trim() || '看看这个';
        const desc = meta?.description?.trim() || '';
        const pic = meta?.picUrl?.trim() || '';
        return parseRepliesFromText(`link:${title}|${desc}|${value}|${pic}`);
    }
    if (kind === 'app') {
        if (/^app:\d+\s+</iu.test(value)) return parseRepliesFromText(value);
        const appType = meta?.appType ?? 19;
        return parseRepliesFromText(`app:${appType} ${value}`);
    }
    if (kind === 'raw') {
        const looksJson = value.startsWith('{') || value.startsWith('[');
        return textReply(looksJson ? '好了 👌' : value);
    }
    return parseRepliesFromText(value);
}

const MAPPERS: Record<MapperName, MapFn> = {
    text: (result) => mapMcpResult(result, '这次没弄成，再试下'),
    image,
    video,
    reply,
    search,
    poem,
    ticket,
    'human-start': humanStart,
    'human-status': humanStatus,
    rule: (result) => mapRuleExecute(result),
    time,
    json,
    adventure,
    'video-job': videoJob,
    'parse-video': parseVideo,
    emoji,
};

// ── 入口 ──────────────────────────────────────────────

function catalogReply(): HandlerResponse {
    const verbs = VERBS.flatMap((item) => item.verbs).join('、');
    return textReply([
        '能直接敲的：',
        verbs,
        '',
        '玩法还是原来那样：#修仙状态 #庄园浇水 #八字测算 #今日老婆',
        '主人改规则用 #规则搜索 / #规则启用 那些。',
    ].join('\n'));
}

function isTextReply(value: unknown): value is HandlerResponse {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && (value as {type?: unknown}).type === 'text';
}

/** 修仙选肢要先拉 status 拿到当前 version，否则服务端拒。 */
async function withAdventureVersion(
    ctx: CallCtx,
    server: McpServerId,
    args: Record<string, unknown>,
): Promise<Record<string, unknown> | HandlerResponse> {
    if (args.action !== 'choose') return args;
    const status = await callServerMcp(ctx.env, server, 'xiuxian_adventure', {
        action: 'status',
        ...identityArgs(ctx),
    });
    const version = Number(asRecord(status.raw)?.version);
    if (!Number.isFinite(version) || version <= 0) return textReply('这会儿没有在探的剧情');
    return {...args, version};
}

export async function dispatchMcpCommand(
    command: string,
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const matched = resolveRoute(command);
    if (!matched) return null;
    const ctx: CallCtx = {
        command,
        verb: matched.verb,
        tail: matched.tail,
        message,
        env,
    };
    if (matched.kind === 'local') return catalogReply();

    const route = matched.route;
    if ('ownerOnly' in route && route.ownerOnly && !isOwner(message, env)) {
        return textReply('这事只有主人能定');
    }

    const prepared = route.args(ctx);
    if (!prepared.ok) return textReply(prepared.hint);

    const server = route.server ?? 'cf';
    if (!resolveMcpEndpoint(env, server)) {
        return textReply('这路还没接通');
    }

    let args = prepared.args;
    try {
        if (route.tool === 'xiuxian_adventure') {
            const filled = await withAdventureVersion(ctx, server, args);
            if (isTextReply(filled)) return filled;
            args = filled;
        }
        const result = await callServerMcp(env, server, route.tool, args);
        const mapped = MAPPERS[route.map](result, ctx);
        if (matched.kind === 'prefix' && matched.route.helpRewrite) {
            const [from, to] = matched.route.helpRewrite;
            return rewriteHelpHash(mapped, from, to);
        }
        return mapped;
    } catch {
        return textReply(route.fail);
    }
}
