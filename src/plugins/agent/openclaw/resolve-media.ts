import type {InboundMedia, IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';
import {GolemApi} from '../../../adapter/golem/api.js';
import {FileUploader} from '../../../utils/file-uploader.js';
import {logger} from '../../../utils/logger.js';

export type OpenClawMediaKind = 'image' | 'video' | 'emoji';

export interface OpenClawResolvedMedia {
    url: string;
    kind: OpenClawMediaKind;
    videoUrl?: string;
}

const WECHAT_CDN_HOST = /(?:vweixinf\.tc\.qq\.com|qpic\.cn|wx\.qq\.com|wx\.qlogo\.cn|weixin\.qq\.com)/iu;

function isHttpUrl(value: string | undefined): value is string {
    return Boolean(value?.trim() && /^https?:\/\//iu.test(value.trim()));
}

function resolveMedia(message: IncomingMessage): InboundMedia | undefined {
    return message.media ?? message.quote?.media;
}

export function resolveOpenClawMediaKind(message: IncomingMessage): OpenClawMediaKind | undefined {
    if (message.type === 'video' || message.quote?.referType === 43) return 'video';
    if (message.type === 'emoji' || message.quote?.referType === 47) return 'emoji';
    if (message.type === 'image' || message.quote?.referType === 3) return 'image';
    return isHttpUrl(resolveMedia(message)?.url) ? 'image' : undefined;
}

function cdnCreds(media: InboundMedia | undefined): {fileId: string; aesKey: string} | undefined {
    const fileId = media?.fileId?.trim() ?? '';
    const aesKey = media?.aesKey?.trim() ?? '';
    if (!fileId || !aesKey) return undefined;
    return {fileId, aesKey};
}

function detectImageContentType(bytes: Uint8Array): string {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png';
    }
    if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return 'image/gif';
    }
    return 'image/jpeg';
}

function looksLikeImageBytes(bytes: Uint8Array): boolean {
    if (bytes.length < 6) return false;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
    const head = new TextDecoder().decode(bytes.slice(0, 64)).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype') || head.trimStart().startsWith('{')) {
        return false;
    }
    return bytes.length >= 256;
}

function extOf(contentType: string, fallback: string): string {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('mp4')) return 'mp4';
    return fallback;
}

function golemApi(env: Env): GolemApi | null {
    const base = env.WECHAT_API_BASE_URL?.trim();
    return base ? new GolemApi(base) : null;
}

async function uploadBytes(
    data: ArrayBuffer,
    kind: 'image' | 'video',
): Promise<string | null> {
    if (!data.byteLength) return null;
    const bytes = new Uint8Array(data);
    if (kind === 'image' && !looksLikeImageBytes(bytes)) return null;
    const contentType = kind === 'video' ? 'video/mp4' : detectImageContentType(bytes);
    return FileUploader.upload(data, {
        fileName: `openclaw-${kind}-${Date.now()}.${extOf(contentType, kind === 'video' ? 'mp4' : 'jpg')}`,
        contentType,
    });
}

async function httpDownload(url: string): Promise<ArrayBuffer | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Referer: 'https://wx.qq.com/',
            },
        });
        if (!response.ok) {
            logger.warn('微信直链拉取失败', {status: response.status});
            return null;
        }
        return response.arrayBuffer();
    } catch (error) {
        logger.warn('微信直链拉取异常', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function publicizeHttpUrl(url: string, kind: 'image' | 'video'): Promise<string | null> {
    const raw = await httpDownload(url);
    if (!raw) return WECHAT_CDN_HOST.test(url) ? null : url;
    const uploaded = await uploadBytes(raw, kind);
    return uploaded ?? (WECHAT_CDN_HOST.test(url) ? null : url);
}

async function downloadThenUpload(
    loader: () => Promise<ArrayBuffer>,
    kind: 'image' | 'video',
): Promise<string | null> {
    try {
        return await uploadBytes(await loader(), kind);
    } catch (error) {
        logger.warn('Golem CDN 下载失败', {
            kind,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * 入站时经 Golem / 直链拿到字节再传到 upfile。失败返回 null，不挡文字。
 */
export async function resolveOpenClawMedia(
    message: IncomingMessage,
    env: Env,
): Promise<OpenClawResolvedMedia | null> {
    try {
        const media = resolveMedia(message);
        if (!media) return null;
        if (isHttpUrl(media.publicUrl)) {
            return {
                url: media.publicUrl.trim(),
                kind: resolveOpenClawMediaKind(message) ?? 'image',
                ...(isHttpUrl(media.videoPublicUrl) ? {videoUrl: media.videoPublicUrl.trim()} : {}),
            };
        }

        const kind = resolveOpenClawMediaKind(message);
        const creds = cdnCreds(media);
        const api = golemApi(env);

        if (kind === 'video') {
            const coverUrl = isHttpUrl(media.thumbUrl)
                ? await publicizeHttpUrl(media.thumbUrl.trim(), 'image')
                : (api && creds
                    ? await downloadThenUpload(
                        () => api.cdnDownloadVideoCoverRaw(creds.fileId, creds.aesKey),
                        'image',
                    )
                    : null);
            const videoUrl = api && creds
                ? await downloadThenUpload(
                    () => api.cdnDownloadVideoRaw(creds.fileId, creds.aesKey),
                    'video',
                )
                : (isHttpUrl(media.url) ? await publicizeHttpUrl(media.url.trim(), 'video') : null);
            if (coverUrl) return {url: coverUrl, kind: 'image', ...(videoUrl ? {videoUrl} : {})};
            if (videoUrl) return {url: videoUrl, kind: 'video'};
            return null;
        }

        if (isHttpUrl(media.url)) {
            const fromHttp = await publicizeHttpUrl(media.url.trim(), 'image');
            if (fromHttp) return {url: fromHttp, kind: kind ?? 'image'};
        }

        if (api && creds) {
            const fromCdn = await downloadThenUpload(
                () => api.cdnDownloadImageRaw(creds.fileId, creds.aesKey),
                'image',
            );
            if (fromCdn) return {url: fromCdn, kind: kind ?? 'image'};
        }

        if (isHttpUrl(media.thumbUrl)) {
            const fromThumb = await publicizeHttpUrl(media.thumbUrl.trim(), 'image');
            if (fromThumb) return {url: fromThumb, kind: 'image'};
        }

        return null;
    } catch (error) {
        logger.warn('OpenClaw 媒体公网 URL 解析失败', {
            messageId: message.messageId,
            type: message.type,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
