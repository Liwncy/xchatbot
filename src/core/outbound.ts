import {
    appReply,
    emojiReply,
    imageReply,
    linkReply,
    musicReply,
    textReply,
    videoReply,
    voiceReply,
    type ReplyMessage,
} from './reply.js';

const APP_LINE = /^app:(\d+)\s+(<.+)$/iu;
const EMOJI_LINE = /^(?:emoji:)([0-9a-f]{32})(?:\|([^|]*))?(?:\s+(https?:\/\/\S+))?$/iu;
const AT_LINE = /^at:([^\s|]+)\|(.+)$/isu;

function looksLikeHttp(value: string): boolean {
    const lower = value.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
}

function stripTrailingPunct(raw: string): string {
    let url = raw.trim();
    while (url.length > 0) {
        const c = url.charAt(url.length - 1);
        if (')]"\'。！？!?，,.'.includes(c)) {
            url = url.slice(0, -1);
            continue;
        }
        break;
    }
    return url;
}

function sanitizeUrl(raw: string): string {
    return stripTrailingPunct(raw);
}

function part(parts: string[], index: number): string {
    return parts[index]?.trim() ?? '';
}

function parseSeconds(raw: string): number | undefined {
    if (!/^\d+$/u.test(raw)) return undefined;
    const n = Number(raw);
    return n > 0 ? n : undefined;
}

function parseImageLine(payload: string): ReplyMessage | null {
    const url = sanitizeUrl(payload.split('|', 1)[0] ?? '');
    if (!looksLikeHttp(url)) return null;
    return imageReply(url);
}

function parseVideoLine(payload: string): ReplyMessage | null {
    const parts = payload.split('|');
    const url = sanitizeUrl(part(parts, 0));
    if (!looksLikeHttp(url)) return null;
    let thumb = sanitizeUrl(part(parts, 1));
    if (thumb && !looksLikeHttp(thumb)) thumb = '';
    return videoReply(url, thumb || undefined, parseSeconds(part(parts, 2)));
}

function parseVoiceLine(payload: string): ReplyMessage | null {
    const parts = payload.split('|');
    const url = sanitizeUrl(part(parts, 0));
    if (!looksLikeHttp(url)) return null;
    return voiceReply(url, parseSeconds(part(parts, 1)), part(parts, 2) || undefined);
}

function parseLinkLine(payload: string): ReplyMessage | null {
    const parts = payload.split('|');
    const title = part(parts, 0);
    let desc = part(parts, 1);
    let url = sanitizeUrl(part(parts, 2));
    let thumb = sanitizeUrl(part(parts, 3));
    if (parts.length === 2 && looksLikeHttp(desc) && !looksLikeHttp(title)) {
        url = sanitizeUrl(desc);
        desc = '';
    }
    if (!looksLikeHttp(url)) return null;
    if (thumb && !looksLikeHttp(thumb)) thumb = '';
    return linkReply(title || '链接', url, desc || undefined, thumb || undefined);
}

function parseMusicLine(payload: string): ReplyMessage | null {
    const parts = payload.split('|');
    const title = part(parts, 0);
    let singer = part(parts, 1);
    let url = sanitizeUrl(part(parts, 2));
    let dataUrl = sanitizeUrl(part(parts, 3));
    let thumb = sanitizeUrl(part(parts, 4));
    if (parts.length === 2 && looksLikeHttp(singer) && !looksLikeHttp(title)) {
        url = sanitizeUrl(singer);
        singer = '';
    }
    if (dataUrl && !looksLikeHttp(dataUrl)) dataUrl = '';
    if (thumb && !looksLikeHttp(thumb)) thumb = '';
    if (!looksLikeHttp(url) && !looksLikeHttp(dataUrl)) return null;
    return musicReply(title || '音乐', singer || undefined, url || undefined, dataUrl || undefined, thumb || undefined);
}

function parseEmojiLine(line: string): ReplyMessage | null {
    const match = EMOJI_LINE.exec(line.trim());
    if (!match) return null;
    const md5 = match[1].toLowerCase();
    const piped = sanitizeUrl(match[2] ?? '');
    const spaced = sanitizeUrl(match[3] ?? '');
    const url = looksLikeHttp(piped) ? piped : looksLikeHttp(spaced) ? spaced : '';
    return emojiReply(md5, url || undefined);
}

function parseAppLine(line: string): ReplyMessage | null {
    const match = APP_LINE.exec(line.trim());
    if (!match) return null;
    const appType = Number(match[1]);
    const xml = match[2].trim();
    if (!Number.isFinite(appType) || !xml) return null;
    return appReply(appType, xml);
}

function parseAtLine(line: string): ReplyMessage | null {
    const match = AT_LINE.exec(line.trim());
    if (!match) return null;
    const wxid = match[1].trim();
    const content = match[2].trim();
    if (!wxid || !content) return null;
    return {type: 'text', content, mentions: [wxid]};
}

function parseOutboundLine(line: string): ReplyMessage | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('image:')) return parseImageLine(trimmed.slice(6));
    if (lower.startsWith('video:')) return parseVideoLine(trimmed.slice(6));
    if (lower.startsWith('audio:')) return parseVoiceLine(trimmed.slice(6));
    if (lower.startsWith('voice:')) return parseVoiceLine(trimmed.slice(6));
    if (lower.startsWith('link:')) return parseLinkLine(trimmed.slice(5));
    if (lower.startsWith('music:')) return parseMusicLine(trimmed.slice(6));
    if (lower.startsWith('emoji:')) return parseEmojiLine(trimmed);
    if (lower.startsWith('app:')) return parseAppLine(trimmed);
    if (lower.startsWith('at:')) return parseAtLine(trimmed);
    return null;
}

/** 配文与单独一行协议拆成多条回复。槽位与 outbound-reply Skill 对齐。 */
export function parseRepliesFromText(text: string): ReplyMessage[] {
    const replies: ReplyMessage[] = [];
    const buffer: string[] = [];

    const flush = (): void => {
        const content = buffer.join('\n').trim();
        if (content) replies.push(textReply(content));
        buffer.length = 0;
    };

    for (const line of text.split(/\r?\n/u)) {
        const parsed = parseOutboundLine(line);
        if (parsed) {
            flush();
            replies.push(parsed);
            continue;
        }
        buffer.push(line);
    }
    flush();
    return replies;
}
