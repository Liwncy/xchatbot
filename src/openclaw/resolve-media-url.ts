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
        if (!quote) return null;

        if (quote.imageMeta?.fileId && quote.imageMeta.fileAesKey) {
            return await resolvePublicImageUrlFromMeta(quote.imageMeta, env);
        }

        const emojiUrl = quote.emojiMeta?.cdnurl?.trim()
            || quote.mediaHint?.emojiUrl?.trim()
            || '';
        if (emojiUrl) {
            return await resolvePublicImageUrlFromEmojiCdnurl(emojiUrl);
        }

        if (quote.referType === 43 || quote.videoMeta) {
            return await resolveQuotedVideoCoverUrl(message, env);
        }

        const hintUrl = quote.mediaHint?.originalUrl?.trim()
            || quote.mediaHint?.url?.trim()
            || quote.mediaHint?.thumbUrl?.trim()
            || '';
        if (hintUrl && isHttpUrl(hintUrl)) {
            return hintUrl;
        }

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
