import type {PeerShoutType} from './types.js';

const ASK_TOKEN = '{问}';

export function inferShoutType(template: string): PeerShoutType {
    const text = template.trim();
    if (!text) return 'chat';
    if (text.includes(ASK_TOKEN)) return 'param';
    if (!/\s/u.test(text)) return 'fixed';
    return 'param';
}

/** 整句无空格 → 照念（fixed）；有 `{问}` 或空格 → 带参（param，空格句收成前缀 + {问}）；空 → 人话（chat）。 */
export function normalizeShoutTemplate(raw: string): {
    type: PeerShoutType;
    template: string;
    example: string;
} {
    const text = raw.trim();
    if (!text) return {type: 'chat', template: '', example: ''};
    if (text.includes(ASK_TOKEN)) {
        return {type: 'param', template: text, example: ''};
    }
    if (!/\s/u.test(text)) {
        return {type: 'fixed', template: text, example: ''};
    }
    const split = text.search(/\s+/u);
    const prefix = text.slice(0, split).trim();
    const example = text.slice(split).trim();
    return {type: 'param', template: `${prefix} ${ASK_TOKEN}`, example};
}

/** `{问}` 后面还有字的模板（`发{问}表情`）：拆出前后两段。`{问}` 在最后的普通模板（`music {问}`）不算。 */
export function wrapParts(template: string): {head: string; tail: string} | null {
    const text = template.trim();
    const at = text.indexOf(ASK_TOKEN);
    if (at < 0) return null;
    const tail = text.slice(at + ASK_TOKEN.length).trim();
    if (!tail) return null;
    return {head: text.slice(0, at).replace(/@\S+\s*/u, '').trim(), tail};
}

export function extractAsk(query: string, template: string): string {
    const text = query.trim();
    if (!text) return '';
    const wrap = wrapParts(template);
    if (wrap && wrap.tail) {
        const body = text.replace(/^[@＠]\S+\s*/u, '').trim();
        const lower = body.toLowerCase();
        const head = wrap.head.toLowerCase();
        const tail = wrap.tail.toLowerCase();
        const headed = !head || lower.startsWith(head);
        const tailed = lower.endsWith(tail);
        // 整句「发掌嘴表情」→ 掌嘴；只给了「掌嘴」就原样用；只有尾（「掌嘴表情」）剥掉尾。
        // 只有头不剥：「发呆」是表情名，不是「发」+「呆」。
        if (headed && tailed && body.length > head.length + tail.length) {
            return body.slice(head.length, body.length - tail.length).trim();
        }
        if (tailed && !headed) return body.slice(0, body.length - tail.length).trim() || body;
        return body;
    }
    const prefix = shoutPrefix(template);
    if (!prefix) return text;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const matched = new RegExp(`^@?\\S*\\s*${escaped}\\s+`, 'iu').exec(text);
    if (matched) return text.slice(matched[0].length).trim();
    if (text.toLowerCase() === prefix.toLowerCase()) return '';
    return text;
}

function shoutPrefix(template: string): string {
    const text = template.trim();
    if (!text.includes(ASK_TOKEN)) return '';
    return text.slice(0, text.indexOf(ASK_TOKEN)).replace(/@\S+\s*/u, '').trim();
}

/** 拼喊法要的几样：喊法类型、模板、要不要 @、@ 谁（花名）。 */
export interface ShoutRoute {
    type: PeerShoutType;
    template: string;
    mention: boolean;
    name: string;
}

export function renderShout(
    route: ShoutRoute,
    ask: string,
): {ok: boolean; text: string} {
    if (route.type === 'fixed') {
        return {ok: true, text: withAt(route, route.template)};
    }
    const filled = ask.trim();
    if (!filled) return {ok: false, text: ''};
    if (route.type === 'chat') {
        return {ok: true, text: withAt(route, filled)};
    }
    const body = route.template.includes(ASK_TOKEN)
        ? route.template.replaceAll(ASK_TOKEN, filled)
        : `${route.template} ${filled}`.trim();
    return {ok: true, text: withAt(route, body)};
}

function withAt(
    route: Pick<ShoutRoute, 'mention' | 'name'>,
    body: string,
): string {
    const text = body.trim();
    if (!route.mention) return text;
    if (!route.name.trim()) return text;
    if (text.startsWith('@') || text.startsWith('＠')) return text;
    return `@${route.name.trim()} ${text}`;
}

export function outboundLine(wxid: string, text: string): string {
    const id = wxid.trim();
    const body = text.trim();
    if (!id || !body) return body;
    return `at:${id}|${body}`;
}
