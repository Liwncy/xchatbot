import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import {logger} from '../utils/logger.js';
import {
    resolvePublicImageUrlForAgnes,
    resolvePublicImageUrlFromEmojiCdnurl,
    resolvePublicImageUrlFromMessage,
    resolvePublicImageUrlFromMeta,
} from '../plugins/cognitive/agnes-text/resolve-image.js';
import {resolveImageDataFromMeta} from '../plugins/cognitive/intent-image/recognize.js';

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
    return (match?.[1] ?? trimmed).replace(/\s+/g, '');
}

/** 仅把「像图片二进制」的 base64 当原料，避免把微信 CDN fileId 误上传。 */
function looksLikeImageBase64(value: string): boolean {
    const normalized = normalizeBase64(value);
    if (!normalized || normalized.length < 64) return false;
    if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) return false;

    if (
        normalized.startsWith('/9j/')
        || normalized.startsWith('iVBOR')
        || normalized.startsWith('R0lGO')
        || normalized.startsWith('UklGR')
        || normalized.startsWith('Qk')
    ) {
        return true;
    }

    try {
        const head = atob(normalized.slice(0, 48));
        const bytes = new Uint8Array(head.length);
        for (let i = 0; i < head.length; i += 1) {
            bytes[i] = head.charCodeAt(i);
        }
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
        if (
            bytes.length >= 8
            && bytes[0] === 0x89
            && bytes[1] === 0x50
            && bytes[2] === 0x4e
            && bytes[3] === 0x47
        ) {
            return true;
        }
        if (
            bytes.length >= 6
            && bytes[0] === 0x47
            && bytes[1] === 0x49
            && bytes[2] === 0x46
            && bytes[3] === 0x38
        ) {
            return true;
        }
    } catch {
        return false;
    }
    return false;
}

async function resolvePublicUrlFromMediaPayload(value?: string): Promise<string | null> {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;

    if (isHttpUrl(trimmed)) {
        return resolvePublicImageUrlForAgnes({kind: 'url', value: trimmed});
    }

    if (looksLikeImageBase64(trimmed)) {
        return resolvePublicImageUrlForAgnes({kind: 'base64', value: normalizeBase64(trimmed)});
    }

    return null;
}

async function resolveQuotedVideoCoverUrl(
    message: IncomingMessage,
    env: Env,
): Promise<string | null> {
    const videoMeta = message.quote?.videoMeta;
    const thumbFileId = videoMeta?.thumbFileId?.trim() ?? '';
    const thumbAesKey = videoMeta?.thumbAesKey?.trim() ?? '';
    if (!thumbFileId || !thumbAesKey) return null;

    const imageData = await resolveImageDataFromMeta(
        {fileId: thumbFileId, fileAesKey: thumbAesKey},
        env,
    );
    if (!imageData) return null;
    return resolvePublicImageUrlForAgnes(imageData);
}

async function resolveQuotedHintMediaUrl(
    quote: NonNullable<IncomingMessage['quote']>,
): Promise<string | null> {
    const candidates = [
        quote.mediaHint?.mediaId,
        quote.mediaHint?.originalUrl,
        quote.mediaHint?.url,
        quote.mediaHint?.thumbUrl,
    ];

    for (const candidate of candidates) {
        const resolved = await resolvePublicUrlFromMediaPayload(candidate);
        if (resolved) return resolved;
    }
    return null;
}

/**
 * 为 OpenClaw 入站解析可下载的公网媒体 URL。
 * 当前优先图片/表情；引用视频仅尝试封面图。
 */
export async function resolveOpenClawMediaUrl(
    message: IncomingMessage,
    env: Env,
): Promise<string | null> {
    try {
        if (message.type === 'image') {
            return await resolvePublicImageUrlFromMessage(message, env);
        }

        if (message.type === 'emoji') {
            const cdnurl = message.emoji?.cdnurl?.trim() ?? '';
            if (cdnurl) {
                return await resolvePublicImageUrlFromEmojiCdnurl(cdnurl);
            }
        }

        const quote = message.quote;
        if (!quote) {
            return await resolvePublicUrlFromMediaPayload(
                message.mediaHint?.mediaId
                    ?? message.mediaId
                    ?? message.mediaHint?.originalUrl,
            );
        }

        if (quote.imageMeta?.fileId && quote.imageMeta.fileAesKey) {
            const fromMeta = await resolvePublicImageUrlFromMeta(quote.imageMeta, env);
            if (fromMeta) return fromMeta;
        }

        const emojiUrl = quote.emojiMeta?.cdnurl?.trim()
            || quote.mediaHint?.emojiUrl?.trim()
            || '';
        if (emojiUrl) {
            const fromEmoji = await resolvePublicImageUrlFromEmojiCdnurl(emojiUrl);
            if (fromEmoji) return fromEmoji;
        }

        if (quote.referType === 43 || quote.videoMeta) {
            const coverUrl = await resolveQuotedVideoCoverUrl(message, env);
            if (coverUrl) return coverUrl;
        }

        // 规则引用 ./i：D1 常只有 media_id(base64)，没有 imageMeta
        const fromHint = await resolveQuotedHintMediaUrl(quote);
        if (fromHint) return fromHint;

        return null;
    } catch (error) {
        logger.warn('OpenClaw 媒体公网 URL 解析失败', {
            messageId: message.messageId,
            type: message.type,
            referType: message.quote?.referType,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
