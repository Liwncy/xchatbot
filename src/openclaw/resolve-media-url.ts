import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import {FileUploader} from '../utils/file-uploader.js';
import {logger} from '../utils/logger.js';
import {getRequestContext} from '../utils/request-context.js';
import {
    resolvePublicImageUrlForAgnes,
    resolvePublicImageUrlFromEmojiCdnurl,
    resolvePublicImageUrlFromMessage,
    resolvePublicImageUrlFromMeta,
} from '../plugins/cognitive/agnes-text/resolve-image.js';
import {WECHAT_IMAGE_PROXY_PATH} from '../plugins/cognitive/agnes-video/wechat-cdn-image.js';
import {XCHATBOT_PUBLIC_BASE_URL} from '../plugins/cognitive/agnes-video/constants.js';
import {saveWechatMediaTicket} from '../proxy/media-ticket.js';

export type OpenClawMediaKind = 'image' | 'video' | 'emoji';

export interface OpenClawResolvedMedia {
    url: string;
    kind: OpenClawMediaKind;
    /** 视频场景下额外附带的视频代理地址（正文用）；url 可能是更易解析的封面。 */
    videoUrl?: string;
}

const WECHAT_CDN_HOST_PATTERN = /(?:vweixinf\.tc\.qq\.com|qpic\.cn|wx\.qq\.com)/i;
export const WECHAT_VIDEO_PROXY_PATH = '/proxy/wechat-video';

function resolveWorkerPublicBaseUrl(env: Env): string {
    const fromEnv = env.TURNSTILE_BASE_URL?.trim() ?? '';
    const fromRequest = getRequestContext()?.requestOrigin?.trim() ?? '';
    return (fromEnv || fromRequest || XCHATBOT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

async function buildTicketProxyUrl(
    env: Env,
    kind: 'image' | 'video' | 'video-cover',
    meta: {fileId: string; fileAesKey: string},
): Promise<string> {
    const ticket = await saveWechatMediaTicket(env, {
        kind,
        fileId: meta.fileId,
        fileAesKey: meta.fileAesKey,
    });
    const path = kind === 'video' ? WECHAT_VIDEO_PROXY_PATH : WECHAT_IMAGE_PROXY_PATH;
    const url = new URL(path, `${resolveWorkerPublicBaseUrl(env)}/`);
    url.searchParams.set('t', ticket);
    return url.toString();
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^data:(?:image|video)\/[a-z0-9.+-]+;base64,(.+)$/i);
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

function looksLikeVideoBase64(value: string): boolean {
    const normalized = normalizeBase64(value);
    if (!normalized || normalized.length < 256) return false;
    if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) return false;

    try {
        const head = atob(normalized.slice(0, 96));
        if (head.includes('ftyp')) return true; // mp4/mov
        const bytes = new Uint8Array(head.length);
        for (let i = 0; i < head.length; i += 1) {
            bytes[i] = head.charCodeAt(i);
        }
        // EBML / WebM
        if (
            bytes.length >= 4
            && bytes[0] === 0x1a
            && bytes[1] === 0x45
            && bytes[2] === 0xdf
            && bytes[3] === 0xa3
        ) {
            return true;
        }
    } catch {
        return false;
    }
    return false;
}

async function uploadPublicVideoBlob(data: ArrayBuffer | Blob | string): Promise<string | null> {
    return FileUploader.upload(data, {
        fileName: `openclaw-video-${Date.now()}.mp4`,
        contentType: 'video/mp4',
    });
}

async function resolvePublicUrlFromImagePayload(value?: string): Promise<string | null> {
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

async function resolvePublicUrlFromVideoPayload(value?: string): Promise<string | null> {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;

    if (isHttpUrl(trimmed)) {
        if (!WECHAT_CDN_HOST_PATTERN.test(trimmed)) {
            return trimmed;
        }
        try {
            const res = await fetch(trimmed);
            if (!res.ok) {
                logger.warn('OpenClaw 拉视频：微信 CDN fetch 失败', {status: res.status, url: trimmed});
                return null;
            }
            const blob = await res.blob();
            return uploadPublicVideoBlob(blob);
        } catch (error) {
            logger.warn('OpenClaw 拉视频：微信 CDN fetch 异常', {
                url: trimmed,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    if (looksLikeVideoBase64(trimmed)) {
        return uploadPublicVideoBlob(normalizeBase64(trimmed));
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

    const proxyUrl = await buildTicketProxyUrl(env, 'video-cover', {
        fileId: thumbFileId,
        fileAesKey: thumbAesKey,
    });
    logger.info('OpenClaw 视频封面使用短票代理 URL', {proxyUrl});
    return proxyUrl;
}

async function resolveQuotedVideoPublicUrl(
    message: IncomingMessage,
    env: Env,
): Promise<string | null> {
    const videoMeta = message.quote?.videoMeta;
    const fileId = videoMeta?.fileId?.trim() ?? '';
    const fileAesKey = videoMeta?.fileAesKey?.trim() ?? '';
    if (fileId && fileAesKey) {
        // 短票避免超长 id/key 在会话里被截断；真正拉流放到访问代理时。
        const proxyUrl = await buildTicketProxyUrl(env, 'video', {fileId, fileAesKey});
        logger.info('OpenClaw 视频使用短票代理 URL', {
            fileIdPrefix: fileId.slice(0, 24),
            proxyUrl,
        });
        return proxyUrl;
    }

    const quote = message.quote;
    if (!quote) return null;

    const candidates = [
        quote.mediaHint?.mediaId,
        quote.mediaHint?.originalUrl,
        quote.mediaHint?.url,
    ];
    for (const candidate of candidates) {
        const resolved = await resolvePublicUrlFromVideoPayload(candidate);
        if (resolved) return resolved;
    }
    return null;
}

async function resolveQuotedHintImageUrl(
    quote: NonNullable<IncomingMessage['quote']>,
): Promise<string | null> {
    const candidates = [
        quote.mediaHint?.mediaId,
        quote.mediaHint?.originalUrl,
        quote.mediaHint?.url,
        quote.mediaHint?.thumbUrl,
    ];

    for (const candidate of candidates) {
        const resolved = await resolvePublicUrlFromImagePayload(candidate);
        if (resolved) return resolved;
    }
    return null;
}

function isVideoQuote(quote: NonNullable<IncomingMessage['quote']>): boolean {
    return quote.referType === 43 || Boolean(quote.videoMeta);
}

/**
 * 为 OpenClaw 入站解析可下载的公网媒体。
 * 图片/表情/视频（引用视频优先本体，失败再退封面）。
 */
export async function resolveOpenClawMedia(
    message: IncomingMessage,
    env: Env,
): Promise<OpenClawResolvedMedia | null> {
    try {
        if (message.type === 'image') {
            const url = await resolvePublicImageUrlFromMessage(message, env);
            return url ? {url, kind: 'image'} : null;
        }

        if (message.type === 'emoji') {
            const cdnurl = message.emoji?.cdnurl?.trim() ?? '';
            if (cdnurl) {
                const url = await resolvePublicImageUrlFromEmojiCdnurl(cdnurl);
                return url ? {url, kind: 'emoji'} : null;
            }
        }

        if (message.type === 'video') {
            const url = await resolvePublicUrlFromVideoPayload(
                message.mediaHint?.mediaId
                    ?? message.mediaId
                    ?? message.mediaHint?.originalUrl,
            );
            if (url) return {url, kind: 'video'};
            const cover = await resolvePublicUrlFromImagePayload(message.mediaHint?.thumbUrl);
            return cover ? {url: cover, kind: 'image'} : null;
        }

        const quote = message.quote;
        if (!quote) {
            const url = await resolvePublicUrlFromImagePayload(
                message.mediaHint?.mediaId
                    ?? message.mediaId
                    ?? message.mediaHint?.originalUrl,
            );
            return url ? {url, kind: 'image'} : null;
        }

        if (quote.imageMeta?.fileId && quote.imageMeta.fileAesKey) {
            const fromMeta = await resolvePublicImageUrlFromMeta(quote.imageMeta, env);
            if (fromMeta) return {url: fromMeta, kind: 'image'};
        }

        const emojiUrl = quote.emojiMeta?.cdnurl?.trim()
            || quote.mediaHint?.emojiUrl?.trim()
            || '';
        if (emojiUrl) {
            const fromEmoji = await resolvePublicImageUrlFromEmojiCdnurl(emojiUrl);
            if (fromEmoji) return {url: fromEmoji, kind: 'emoji'};
        }

        if (isVideoQuote(quote)) {
            const videoUrl = await resolveQuotedVideoPublicUrl(message, env);
            const coverUrl = await resolveQuotedVideoCoverUrl(message, env)
                || await resolvePublicUrlFromImagePayload(quote.mediaHint?.thumbUrl);

            // 视觉模型优先吃封面；视频短票地址放进正文，避免超长 CDN 参数被截断。
            if (coverUrl) {
                return {
                    url: coverUrl,
                    kind: 'image',
                    ...(videoUrl ? {videoUrl} : {}),
                };
            }
            if (videoUrl) return {url: videoUrl, kind: 'video'};
            return null;
        }

        // 规则引用 ./i：D1 常只有 media_id(base64)，没有 imageMeta
        const fromHint = await resolveQuotedHintImageUrl(quote);
        if (fromHint) return {url: fromHint, kind: 'image'};

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

/** @deprecated 优先使用 resolveOpenClawMedia；保留 URL 字符串兼容。 */
export async function resolveOpenClawMediaUrl(
    message: IncomingMessage,
    env: Env,
): Promise<string | null> {
    const media = await resolveOpenClawMedia(message, env);
    return media?.url ?? null;
}
