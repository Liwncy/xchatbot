import type {IncomingMessage, InboundMedia} from '../../core/message.js';
import {
    appReply,
    emojiReply,
    imageReply,
    linkReply,
    textReply,
    videoReply,
    voiceReply,
    type ReplyMessage,
} from '../../core/reply.js';
import type {Env} from '../../types/env.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {logger} from '../../utils/logger.js';
import {GolemApi} from './api.js';
import {fetchWechatArticlePage} from './article-content.js';
import {parseWechatAppMessage} from './parse-appmsg.js';
import type {PrepareDistributionOptions} from '../types.js';

function httpUrl(value?: string): string | undefined {
    const url = value?.trim() ?? '';
    return /^https?:\/\//iu.test(url) ? url : undefined;
}

function cdnCreds(media?: InboundMedia): {fileId: string; aesKey: string} | null {
    const fileId = media?.fileId?.trim() ?? '';
    const aesKey = media?.aesKey?.trim() ?? '';
    return fileId && aesKey ? {fileId, aesKey} : null;
}

function imageFormat(data: ArrayBuffer): {contentType: string; extension: string} {
    const bytes = new Uint8Array(data);
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return {contentType: 'image/png', extension: 'png'};
    }
    if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return {contentType: 'image/gif', extension: 'gif'};
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57) {
        return {contentType: 'image/webp', extension: 'webp'};
    }
    return {contentType: 'image/jpeg', extension: 'jpg'};
}

async function uploadImage(data: ArrayBuffer): Promise<string | null> {
    const format = imageFormat(data);
    return FileUploader.upload(data, {
        fileName: `wechat-image-${Date.now()}.${format.extension}`,
        contentType: format.contentType,
    });
}

async function resolveImageUrl(api: GolemApi, media?: InboundMedia): Promise<string | null> {
    const direct = httpUrl(media?.publicUrl) ?? httpUrl(media?.url) ?? httpUrl(media?.thumbUrl);
    if (direct) return direct;
    const creds = cdnCreds(media);
    if (!creds) return null;
    return uploadImage(await api.cdnDownloadImageRaw(creds.fileId, creds.aesKey));
}

async function resolveVideoUrls(
    api: GolemApi,
    media?: InboundMedia,
): Promise<{videoUrl: string; thumbUrl?: string} | null> {
    let videoUrl = httpUrl(media?.videoPublicUrl) ?? httpUrl(media?.publicUrl) ?? httpUrl(media?.url);
    let thumbUrl = httpUrl(media?.thumbUrl);
    const creds = cdnCreds(media);
    if (!videoUrl && creds) {
        const data = await api.cdnDownloadVideoRaw(creds.fileId, creds.aesKey);
        videoUrl = await FileUploader.upload(data, {
            fileName: `wechat-video-${Date.now()}.mp4`,
            contentType: 'video/mp4',
        }) ?? undefined;
    }
    if (!thumbUrl && creds) {
        try {
            thumbUrl = await uploadImage(await api.cdnDownloadVideoCoverRaw(creds.fileId, creds.aesKey)) ?? undefined;
        } catch {
            // 封面不是发送视频的必要条件。
        }
    }
    return videoUrl ? {videoUrl, ...(thumbUrl ? {thumbUrl} : {})} : null;
}

function normalizedXml(rawXml: string): string {
    const separator = rawXml.indexOf(':\n');
    return separator > 0 ? rawXml.slice(separator + 2).trim() : rawXml.trim();
}

export async function prepareGolemDistributionMessage(
    message: IncomingMessage,
    env: Env,
    options?: PrepareDistributionOptions,
): Promise<IncomingMessage> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    const api = apiBaseUrl ? new GolemApi(apiBaseUrl) : null;
    try {
        if (message.type === 'image' && api) {
            const publicUrl = await resolveImageUrl(api, message.media);
            return publicUrl
                ? {...message, media: {...message.media, publicUrl}}
                : message;
        }
        if (message.type === 'video' && api) {
            const resolved = await resolveVideoUrls(api, message.media);
            return resolved
                ? {
                    ...message,
                    media: {
                        ...message.media,
                        publicUrl: resolved.thumbUrl ?? message.media?.publicUrl,
                        videoPublicUrl: resolved.videoUrl,
                    },
                }
                : message;
        }
        if (message.type === 'link') {
            const app = message.app
                ?? (message.rawXml ? parseWechatAppMessage(normalizedXml(message.rawXml)) ?? undefined : undefined);
            if (!app) return message;
            if (!options?.expandArticle) return message.app ? message : {...message, app};

            const articles = app.articles?.length
                ? app.articles
                : app.title && app.url
                    ? [{title: app.title, url: app.url, desc: app.desc, thumbUrl: app.thumbUrl}]
                    : [];
            const expanded = await Promise.all(articles.map(async (article) => {
                if (article.contentItems?.length) return article;
                const page = await fetchWechatArticlePage(article.url);
                return {...article, ...page};
            }));
            return {...message, app: {...app, articles: expanded}};
        }
        return message;
    } catch (error) {
        logger.warn('Golem 分发消息标准化失败', {
            type: message.type,
            error: error instanceof Error ? error.message : String(error),
        });
        return message;
    }
}

export async function toGolemOutboundReplies(
    message: IncomingMessage,
    env: Env,
): Promise<ReplyMessage[] | null> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    const api = apiBaseUrl ? new GolemApi(apiBaseUrl) : null;
    try {
        if (message.type === 'text') {
            return message.content?.trim() ? [textReply(message.content)] : null;
        }
        if (message.type === 'emoji' && message.media?.md5) {
            return [emojiReply(message.media.md5, httpUrl(message.media.publicUrl) ?? httpUrl(message.media.url))];
        }
        if (message.type === 'image' && api) {
            const url = await resolveImageUrl(api, message.media);
            return url ? [imageReply(url)] : null;
        }
        if (message.type === 'video' && api) {
            const resolved = await resolveVideoUrls(api, message.media);
            return resolved
                ? [videoReply(resolved.videoUrl, resolved.thumbUrl, message.media?.duration)]
                : null;
        }
        if (message.type === 'voice') {
            const url = httpUrl(message.media?.publicUrl) ?? httpUrl(message.media?.url);
            return url ? [voiceReply(url, message.media?.duration, message.media?.format)] : null;
        }
        if (message.type === 'link') {
            const xml = message.rawXml ? normalizedXml(message.rawXml) : '';
            const app = message.app ?? (xml ? parseWechatAppMessage(xml) ?? undefined : undefined);
            if (message.platform === 'golem' && xml && app?.appType != null) {
                return [appReply(app.appType, xml)];
            }
            if (app?.title && app.url) return [linkReply(app.title, app.url, app.desc, app.thumbUrl)];
        }
        return null;
    } catch (error) {
        logger.warn('Golem 原样消息转换失败', {
            type: message.type,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
