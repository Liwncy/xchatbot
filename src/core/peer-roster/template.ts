import type {PeerRoute, PeerShoutType} from './types.js';

const ASK_TOKEN = '{问}';

export function inferShoutType(template: string): PeerShoutType {
    const text = template.trim();
    if (!text) return 'talk';
    if (text.includes(ASK_TOKEN)) return 'tail';
    if (!/\s/u.test(text)) return 'fixed';
    return 'tail';
}

/** 整句无空格 → 照念；有 `{问}` 或空格 → 带空（空格句收成前缀 + {问}）。 */
export function normalizeShoutTemplate(raw: string): {
    type: PeerShoutType;
    template: string;
    example: string;
} {
    const text = raw.trim();
    if (!text) return {type: 'talk', template: '', example: ''};
    if (text.includes(ASK_TOKEN)) {
        return {type: 'tail', template: text, example: ''};
    }
    if (!/\s/u.test(text)) {
        return {type: 'fixed', template: text, example: ''};
    }
    const split = text.search(/\s+/u);
    const prefix = text.slice(0, split).trim();
    const example = text.slice(split).trim();
    return {type: 'tail', template: `${prefix} ${ASK_TOKEN}`, example};
}

export function extractAsk(query: string, template: string): string {
    const text = query.trim();
    if (!text) return '';
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

export function renderShout(
    route: Pick<PeerRoute, 'type' | 'template' | 'mention' | 'name'>,
    ask: string,
): {ok: boolean; text: string} {
    if (route.type === 'fixed') {
        return {ok: true, text: withAt(route, route.template)};
    }
    const filled = ask.trim();
    if (!filled) return {ok: false, text: ''};
    if (route.type === 'talk') {
        return {ok: true, text: withAt(route, filled)};
    }
    const body = route.template.includes(ASK_TOKEN)
        ? route.template.replaceAll(ASK_TOKEN, filled)
        : `${route.template} ${filled}`.trim();
    return {ok: true, text: withAt(route, body)};
}

function withAt(
    route: Pick<PeerRoute, 'mention' | 'name'>,
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
