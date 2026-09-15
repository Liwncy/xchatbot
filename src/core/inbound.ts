import type {Env} from '../types/env.js';
import {resolveOwnerId} from './bot.js';
import {getRecentChatMessages} from './chat-log/index.js';
import {resolveChatSession} from './chat-log/session.js';
import type {ChatMessageRecord} from './chat-log/types.js';
import type {IncomingMessage, MentionRef, QuoteRef} from './message.js';
import {currentCharacter, wrapUserContent} from './roleplay/index.js';

/** 任何大脑入站前共用：身份前缀、近窗上下文、演法垫。 */
export type InboundMediaKind = 'image' | 'video' | 'emoji';

export type InboundMediaHint = {
    url?: string;
    videoUrl?: string;
    kind?: InboundMediaKind;
};

const CONTEXT_WINDOW_MINUTES = 10;
const CONTEXT_MAX_MESSAGES = 15;
const QUOTE_CLIP = 500;
const CONTEXT_LINE_CLIP = 300;

function isHttpUrl(value: string | undefined): value is string {
    return Boolean(value?.trim() && /^https?:\/\//iu.test(value.trim()));
}

function looksLikeLocalFile(value: string): boolean {
    const text = value.trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
    return lower.startsWith('file:') || text.includes('\\') || text.startsWith('/');
}

function clip(value: string, max: number): string {
    const text = value.replace(/\s+/gu, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function firstNonBlank(...values: Array<string | undefined>): string {
    for (const value of values) {
        const text = value?.trim() ?? '';
        if (text) return text;
    }
    return '';
}

function speakerLabel(id: string, name?: string): string {
    const userId = id.trim() || 'unknown';
    const nick = name?.trim() ?? '';
    return !nick || nick === userId ? userId : `${userId}/${nick}`;
}

function mediaAddressLabel(kind: InboundMediaKind | undefined): string {
    if (kind === 'emoji') return '表情地址';
    if (kind === 'video') return '视频地址';
    return '图片地址';
}

function quoteTypeLabel(referType: number | undefined): string {
    switch (referType) {
        case 3:
            return 'image';
        case 47:
            return 'emoji';
        case 43:
            return 'video';
        case 34:
            return 'voice';
        default:
            return '';
    }
}

function inferMediaKind(message: IncomingMessage): InboundMediaKind | undefined {
    if (message.type === 'video' || message.quote?.referType === 43) return 'video';
    if (message.type === 'emoji' || message.quote?.referType === 47) return 'emoji';
    if (message.type === 'image' || message.quote?.referType === 3) return 'image';
    return isHttpUrl((message.media ?? message.quote?.media)?.url) ? 'image' : undefined;
}

function readableQuoteText(quote: QuoteRef): string {
    const raw = firstNonBlank(quote.referContent, quote.title);
    if (!raw) return '';
    if (raw.includes('<')) return clip(quote.title, QUOTE_CLIP);
    return clip(raw, QUOTE_CLIP);
}

function captionForType(message: IncomingMessage): string {
    const userText = message.content?.trim() ?? '';
    if (userText && !userText.startsWith('[')) return userText;
    switch (message.type) {
        case 'image':
            return '请看这张图片';
        case 'video':
            return '请看这段视频';
        case 'voice':
            return '请听这段语音';
        case 'emoji':
            return '请看这个表情';
        case 'link':
            return firstNonBlank(message.quote?.title, userText, '请查看链接');
        default:
            return userText || message.quote?.title?.trim() || '';
    }
}

function appendMediaTokens(text: string, md5?: string, url?: string): string {
    let next = text;
    const fingerprint = md5?.trim() ?? '';
    const http = isHttpUrl(url) ? url.trim() : '';
    if (fingerprint && !next.includes(`md5=${fingerprint}`)) next += ` md5=${fingerprint}`;
    if (http && !next.includes(http)) next += ` url=${http}`;
    return next.trim();
}

export async function buildSpeakerPrefix(message: IncomingMessage, env: Env): Promise<string> {
    const ownerId = resolveOwnerId(env, message.platform);
    const isOwner = Boolean(ownerId && message.from.trim() === ownerId);
    const speaker = speakerLabel(message.from, message.senderName);
    const role = (await currentCharacter(env, message))?.name?.trim();
    const scope = message.source === 'group'
        ? `group:${message.room?.id ?? ''}`
        : `user:${message.from}`;
    return `[${speaker}${isOwner ? ' owner' : ''}${role ? ` role=${role}` : ''} scope=${scope}]`;
}

function formatQuote(quote: QuoteRef | undefined, mediaUrl?: string): string {
    if (!quote) return '';
    const text = readableQuoteText(quote);
    if (!text) return '';
    const kind = quoteTypeLabel(quote.referType);
    const from = firstNonBlank(quote.referSenderName, quote.referFrom);
    let line = '[引用';
    if (kind && kind !== 'text') line += `:${kind}`;
    if (from) line += ` ${from}`;
    line += `] ${text}`;
    if (kind === 'image' || kind === 'emoji') {
        line = appendMediaTokens(line, quote.media?.md5, quote.media?.publicUrl || quote.media?.url || mediaUrl);
    }
    return line;
}

function formatMentions(mentions: MentionRef[] | undefined): string[] {
    if (!mentions?.length) return [];
    return mentions.flatMap((mention, index) => {
        const id = mention.id.trim();
        const name = mention.name?.trim() ?? '';
        if (!id && !name) return [];
        const who = !name || name === id ? (id || name) : `${id}/${name}`;
        return [`[被@ ${index + 1} ${who}]`];
    });
}

export async function formatCurrentInbound(
    message: IncomingMessage,
    env: Env,
    media?: InboundMediaHint,
): Promise<string> {
    const kind = media?.kind ?? inferMediaKind(message);
    const mediaRef = message.media ?? message.quote?.media;
    const parts: string[] = [];
    let caption = captionForType(message);
    if (message.type === 'emoji' || kind === 'emoji') {
        caption = appendMediaTokens(
            caption || '请看这个表情',
            mediaRef?.md5,
            media?.url || mediaRef?.publicUrl || mediaRef?.url,
        );
    }
    if (caption) parts.push(caption);

    const quote = formatQuote(message.quote, media?.url);
    if (quote) parts.push(quote);

    if (isHttpUrl(media?.url) && message.type !== 'emoji' && kind !== 'emoji') {
        parts.push(`${mediaAddressLabel(kind)}: ${media.url.trim()}`);
    }
    if (isHttpUrl(media?.videoUrl) && media.videoUrl.trim() !== media?.url?.trim()) {
        parts.push(`视频地址: ${media.videoUrl.trim()}`);
    }
    if (mediaRef?.md5?.trim() && message.type !== 'emoji' && kind !== 'emoji') {
        const md5 = mediaRef.md5.trim();
        if (!parts.some((line) => line.includes(`md5=${md5}`))) {
            parts.push(`MD5: ${md5}`);
        }
    }

    parts.push(...formatMentions(message.mentions));
    const body = parts.join('\n').trim();
    const prefix = await buildSpeakerPrefix(message, env);
    return body ? `${prefix} ${body}` : prefix;
}

function parsePayload(raw: string): Record<string, unknown> {
    try {
        const parsed = raw ? JSON.parse(raw) as unknown : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function historyLine(row: ChatMessageRecord): string {
    const speaker = speakerLabel(row.senderId, row.senderName);
    let text = clip(row.contentText ?? '', CONTEXT_LINE_CLIP);
    if (looksLikeLocalFile(text)) text = '';
    const type = row.msgType?.trim() ?? '';
    if (!text) text = type ? `[${type}]` : '[消息]';
    if (type && type !== 'text' && !text.startsWith('[')) {
        text = `[${type}] ${text}`;
    }
    const payload = parsePayload(row.payloadJson);
    const media = payload.media && typeof payload.media === 'object'
        ? payload.media as Record<string, unknown>
        : {};
    const md5 = typeof media.md5 === 'string' ? media.md5.trim() : '';
    const url = firstNonBlank(
        typeof media.publicUrl === 'string' ? media.publicUrl : undefined,
        typeof media.url === 'string' ? media.url : undefined,
        typeof payload.url === 'string' ? payload.url : undefined,
    );
    text = appendMediaTokens(text, md5, isHttpUrl(url) ? url : undefined);
    if (isHttpUrl(typeof media.publicUrl === 'string' ? media.publicUrl : undefined)) {
        text += ' （附图）';
    }
    return `${speaker}: ${text}`;
}

export function prependRecentContext(
    current: string,
    rows: ChatMessageRecord[],
    windowMinutes = CONTEXT_WINDOW_MINUTES,
): string {
    const lines = rows.map(historyLine).filter(Boolean);
    if (lines.length === 0) return current;
    return [
        `[近${Math.max(windowMinutes, 0)}分钟上下文，不是本条指令]`,
        ...lines,
        '---',
        '[本条]',
        current,
    ].join('\n');
}

export async function buildInboundContent(
    message: IncomingMessage,
    env: Env,
    media?: InboundMediaHint,
): Promise<string> {
    const current = await formatCurrentInbound(message, env, media);
    let assembled = current;
    try {
        const sessionId = resolveChatSession(message).sessionId;
        const rows = await getRecentChatMessages(env, sessionId, {
            limit: CONTEXT_MAX_MESSAGES,
            excludeMessageId: message.messageId,
            sinceUnix: Math.floor(Date.now() / 1000) - CONTEXT_WINDOW_MINUTES * 60,
            direction: 'inbound',
        });
        assembled = prependRecentContext(current, rows);
    } catch {
        assembled = current;
    }
    return wrapUserContent(assembled, await currentCharacter(env, message));
}
