import {ChatLogRepository, parseWechatRevokeFromPayload, resolveChatSession} from '../../chat-log/index.js';
import type {ChatMessageRecord} from '../../chat-log/types.js';
import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../../types/message.js';

type QuoteSenderScope = 'user' | 'bot';
type QuoteTypeSelector = 'any' | 'text' | 'image' | 'emoji' | 'voice' | 'video' | 'link' | 'news' | 'markdown';

type ParsedQuoteDirective = {
    senderScope: QuoteSenderScope;
    typeSelector: QuoteTypeSelector;
    rank: number;
    remainder: string;
};

const TYPE_TOKEN_MAP: Record<string, QuoteTypeSelector> = {
    t: 'text',
    i: 'image',
    e: 'emoji',
    v: 'voice',
    p: 'video',
    l: 'link',
    n: 'news',
    m: 'markdown',
};

function parsePositiveInt(value: string): number | null {
    if (!/^\d+$/u.test(value)) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function parseQuoteDirective(content: string): ParsedQuoteDirective | null {
    const raw = content.trim();
    if (!raw.startsWith('./')) return null;

    const firstSpaceIndex = raw.search(/\s/u);
    const token = firstSpaceIndex >= 0 ? raw.slice(2, firstSpaceIndex) : raw.slice(2);
    const remainder = firstSpaceIndex >= 0 ? raw.slice(firstSpaceIndex).trimStart() : '';

    let senderScope: QuoteSenderScope = 'user';
    let typeSelector: QuoteTypeSelector = 'any';
    let cursor = 0;

    if (!token) {
        return {senderScope, typeSelector, rank: 1, remainder};
    }

    if (token[cursor]?.toLowerCase() === 'b') {
        senderScope = 'bot';
        cursor += 1;
    }

    const mappedType = TYPE_TOKEN_MAP[token[cursor]?.toLowerCase() ?? ''];
    if (mappedType) {
        typeSelector = mappedType;
        cursor += 1;
    }

    const numericPart = token.slice(cursor);
    if (!numericPart) {
        if (cursor === 0 && token) return null;
        return {senderScope, typeSelector, rank: 1, remainder};
    }

    const rank = parsePositiveInt(numericPart);
    if (!rank) return null;

    return {senderScope, typeSelector, rank, remainder};
}

function matchesTypeSelector(record: ChatMessageRecord, typeSelector: QuoteTypeSelector): boolean {
    if (typeSelector === 'any') return true;
    if (typeSelector === 'text') {
        return record.msgType === 'text' || record.msgType === 'markdown';
    }
    return record.msgType === typeSelector;
}

function matchesSenderScope(record: ChatMessageRecord, senderScope: QuoteSenderScope): boolean {
    if (senderScope === 'user') {
        return record.direction === 'inbound' && record.actorType === 'member';
    }
    return record.direction === 'outbound' && record.actorType === 'bot' && record.replyStatus !== 'failed';
}

function parsePayloadJson(payloadJson: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(payloadJson) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as Record<string, unknown>;
    } catch {
        return {};
    }
}

function mapRecordMsgTypeToReferType(record: ChatMessageRecord): number {
    switch (record.msgType) {
        case 'text':
        case 'markdown':
            return 1;
        case 'image':
            return 3;
        case 'voice':
            return 34;
        case 'video':
            return 43;
        case 'emoji':
            return 47;
        case 'location':
            return 48;
        case 'link':
        case 'news':
        case 'card':
        case 'app':
            return 49;
        default:
            return 1;
    }
}

function buildQuotedReferContent(record: ChatMessageRecord, payload: Record<string, unknown>): string {
    if (record.msgType === 'link') {
        const link = payload.link;
        if (link && typeof link === 'object' && !Array.isArray(link)) {
            const title = String((link as {title?: unknown}).title ?? '').trim();
            const url = String((link as {url?: unknown}).url ?? '').trim();
            return [title, url].filter(Boolean).join('\n') || record.contentText;
        }
    }

    if (record.msgType === 'news') {
        const articles = Array.isArray(payload.articles) ? payload.articles : [];
        const first = articles[0] && typeof articles[0] === 'object'
            ? articles[0] as {title?: unknown; url?: unknown}
            : null;
        const title = String(first?.title ?? '').trim();
        const url = String(first?.url ?? '').trim();
        return [title, url].filter(Boolean).join('\n') || record.contentText;
    }

    if (record.msgType === 'image') {
        const originalUrl = String((payload as {original_url?: unknown}).original_url ?? '').trim();
        return originalUrl || record.contentText;
    }

    if (record.msgType === 'voice') {
        const originalUrl = String((payload as {original_url?: unknown}).original_url ?? '').trim();
        return originalUrl || record.contentText;
    }

    if (record.msgType === 'video') {
        const title = String((payload as {title?: unknown}).title ?? '').trim();
        const originalUrl = String((payload as {original_url?: unknown}).original_url ?? '').trim();
        return [title, originalUrl].filter(Boolean).join('\n') || record.contentText;
    }

    if (record.msgType === 'emoji') {
        const emoji = payload.emoji;
        if (emoji && typeof emoji === 'object' && !Array.isArray(emoji)) {
            const cdnurl = String((emoji as {cdnurl?: unknown}).cdnurl ?? '').trim();
            return cdnurl || record.contentText;
        }
        const emojiUrl = String((payload as {emoji_url?: unknown}).emoji_url ?? '').trim();
        return emojiUrl || record.contentText;
    }

    return record.contentText;
}

function buildQuotedTitle(remainder: string): string {
    return remainder.trim();
}

function applyDirectiveMediaHint(
    quote: NonNullable<IncomingMessage['quote']>,
    record: ChatMessageRecord,
    payload: Record<string, unknown>,
): void {
    const mediaHint: NonNullable<NonNullable<IncomingMessage['quote']>['mediaHint']> = {};

    const mediaId = String((payload as {media_id?: unknown}).media_id ?? '').trim();
    const originalUrl = String((payload as {original_url?: unknown}).original_url ?? '').trim();
    const emojiUrl = String((payload as {emoji_url?: unknown}).emoji_url ?? '').trim();
    const md5 = String((payload as {md5?: unknown}).md5 ?? '').trim();
    const durationRaw = (payload as {duration?: unknown}).duration;
    const formatRaw = (payload as {format?: unknown}).format;
    const title = String((payload as {title?: unknown}).title ?? '').trim();
    const url = String((payload as {url?: unknown}).url ?? '').trim();
    const description = String((payload as {description?: unknown}).description ?? '').trim();
    const thumbUrl = String((payload as {thumb_url?: unknown; thumbUrl?: unknown}).thumb_url ?? (payload as {thumbUrl?: unknown}).thumbUrl ?? '').trim();

    if (mediaId) mediaHint.mediaId = mediaId;
    if (originalUrl) mediaHint.originalUrl = originalUrl;
    if (emojiUrl) mediaHint.emojiUrl = emojiUrl;
    if (md5) mediaHint.md5 = md5;
    if (typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0) {
        mediaHint.duration = durationRaw;
    }
    if (typeof formatRaw === 'number' && Number.isFinite(formatRaw)) {
        mediaHint.format = formatRaw;
    }
    if (title) mediaHint.title = title;
    if (url) mediaHint.url = url;
    if (description) mediaHint.description = description;
    if (thumbUrl) mediaHint.thumbUrl = thumbUrl;

    if (record.msgType === 'link') {
        const link = payload.link;
        if (link && typeof link === 'object' && !Array.isArray(link)) {
            const linkTitle = String((link as {title?: unknown}).title ?? '').trim();
            const linkUrl = String((link as {url?: unknown}).url ?? '').trim();
            const linkDescription = String((link as {description?: unknown}).description ?? '').trim();
            if (linkTitle) mediaHint.title = linkTitle;
            if (linkUrl) mediaHint.url = linkUrl;
            if (linkDescription) mediaHint.description = linkDescription;
        }
    }

    if (record.msgType === 'news') {
        const articles = Array.isArray(payload.articles) ? payload.articles : [];
        const first = articles[0] && typeof articles[0] === 'object'
            ? articles[0] as {title?: unknown; url?: unknown; description?: unknown; picUrl?: unknown}
            : null;
        const articleTitle = String(first?.title ?? '').trim();
        const articleUrl = String(first?.url ?? '').trim();
        const articleDescription = String(first?.description ?? '').trim();
        const articleThumb = String(first?.picUrl ?? '').trim();
        if (articleTitle) mediaHint.title = articleTitle;
        if (articleUrl) mediaHint.url = articleUrl;
        if (articleDescription) mediaHint.description = articleDescription;
        if (articleThumb) mediaHint.thumbUrl = articleThumb;
    }

    if (record.msgType === 'emoji') {
        const emoji = payload.emoji;
        if (emoji && typeof emoji === 'object' && !Array.isArray(emoji)) {
            const emojiMd5 = String((emoji as {md5?: unknown}).md5 ?? '').trim();
            const cdnurl = String((emoji as {cdnurl?: unknown}).cdnurl ?? '').trim();
            if (emojiMd5) mediaHint.md5 = emojiMd5;
            if (cdnurl) mediaHint.emojiUrl = cdnurl;
        }
    }

    if (Object.keys(mediaHint).length > 0) {
        quote.mediaHint = mediaHint;
    }
}

function parseVideoMetaFromPayload(
    payload: Record<string, unknown>,
): NonNullable<IncomingMessage['quote']>['videoMeta'] | undefined {
    const raw = (payload as {video_meta?: unknown; videoMeta?: unknown}).video_meta
        ?? (payload as {videoMeta?: unknown}).videoMeta;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

    const meta = raw as {
        fileId?: unknown;
        fileAesKey?: unknown;
        thumbFileId?: unknown;
        thumbAesKey?: unknown;
        duration?: unknown;
    };
    const fileId = String(meta.fileId ?? '').trim();
    const fileAesKey = String(meta.fileAesKey ?? '').trim();
    if (!fileId || !fileAesKey) return undefined;

    const thumbFileId = String(meta.thumbFileId ?? '').trim();
    const thumbAesKey = String(meta.thumbAesKey ?? '').trim();
    const durationRaw = meta.duration;
    const duration = typeof durationRaw === 'number' ? durationRaw : Number(durationRaw);

    return {
        fileId,
        fileAesKey,
        ...(thumbFileId ? {thumbFileId} : {}),
        ...(thumbAesKey ? {thumbAesKey} : {}),
        ...(Number.isFinite(duration) && duration > 0 ? {duration} : {}),
    };
}

function buildDirectiveQuote(
    record: ChatMessageRecord,
    remainder: string,
): NonNullable<IncomingMessage['quote']> {
    const payload = parsePayloadJson(record.payloadJson);
    const quote: NonNullable<IncomingMessage['quote']> = {
        title: buildQuotedTitle(remainder),
        referType: mapRecordMsgTypeToReferType(record),
        referContent: buildQuotedReferContent(record, payload),
        ...(record.senderId.trim() ? {referFrom: record.senderId.trim()} : {}),
        ...(record.senderName.trim() ? {referSenderName: record.senderName.trim()} : {}),
    };

    applyDirectiveMediaHint(quote, record, payload);

    const videoMeta = parseVideoMetaFromPayload(payload);
    if (videoMeta) {
        quote.videoMeta = videoMeta;
    }

    const emoji = payload.emoji;
    if (emoji && typeof emoji === 'object' && !Array.isArray(emoji)) {
        const md5 = String((emoji as {md5?: unknown}).md5 ?? '').trim();
        const cdnurl = String((emoji as {cdnurl?: unknown}).cdnurl ?? '').trim();
        if (md5 || cdnurl) {
            quote.emojiMeta = {md5, cdnurl};
        }
    } else {
        const md5 = String((payload as {md5?: unknown}).md5 ?? '').trim();
        const cdnurl = String((payload as {emoji_url?: unknown}).emoji_url ?? '').trim();
        if (md5 || cdnurl) {
            quote.emojiMeta = {md5, cdnurl};
        }
    }

    const revoke = parseWechatRevokeFromPayload(record.payloadJson);
    if (revoke?.new_id != null && revoke.receiver) {
        quote.referMessageId = {
            newId: typeof revoke.new_id === 'number' ? revoke.new_id : Number.parseInt(String(revoke.new_id), 10),
            ...(typeof revoke.new_id === 'string' ? {newIdText: revoke.new_id} : {}),
            ...(typeof revoke.client_id === 'number' ? {clientId: revoke.client_id} : {}),
            ...(typeof revoke.client_id === 'string' ? {clientIdText: revoke.client_id} : {}),
            createTime: revoke.create_time ?? record.createdAt,
        };
    }

    return quote;
}

function buildSelectorLabel(senderScope: QuoteSenderScope, typeSelector: QuoteTypeSelector): string {
    const senderText = senderScope === 'bot' ? '机器人' : '用户';
    const typeText = typeSelector === 'any'
        ? '消息'
        : typeSelector === 'text'
            ? '文字消息'
            : typeSelector === 'image'
                ? '图片消息'
                : typeSelector === 'emoji'
                    ? '表情消息'
                    : typeSelector === 'voice'
                        ? '语音消息'
                        : typeSelector === 'video'
                            ? '视频消息'
                            : typeSelector === 'link'
                                ? '链接消息'
                                : typeSelector === 'news'
                                    ? '图文消息'
                                    : 'Markdown 消息';
    return `${senderText}${typeText}`;
}

export async function normalizeQuoteDirectiveMessage(
    message: IncomingMessage,
    env: Env,
): Promise<{
    message: IncomingMessage;
    usedDirective: boolean;
    errorText?: string;
}> {
    if (message.type !== 'text') {
        return {message, usedDirective: false};
    }

    const content = message.content?.trim() ?? '';
    const directive = parseQuoteDirective(content);
    if (!directive) {
        return {message, usedDirective: false};
    }

    const session = resolveChatSession(message);
    const rows = await ChatLogRepository.getRecentMessages(env.XBOT_DB, session.sessionId, {
        limit: 200,
        excludeMessageId: message.messageId,
    });

    const matched = rows
        .filter((record) => matchesSenderScope(record, directive.senderScope))
        .filter((record) => matchesTypeSelector(record, directive.typeSelector))
        .reverse();

    const target = matched[directive.rank - 1];
    if (!target) {
        const label = buildSelectorLabel(directive.senderScope, directive.typeSelector);
        return {
            message,
            usedDirective: true,
            errorText: `没翻到上第 ${directive.rank} 条${label} 😅`,
        };
    }

    return {
        message: {
            ...message,
            content: directive.remainder,
            quote: buildDirectiveQuote(target, directive.remainder),
        },
        usedDirective: true,
    };
}
