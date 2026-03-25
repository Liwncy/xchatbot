import type {ImageMessage, TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {WechatApi} from '../../wechat/api.js';
import type {WechatPushItem, WechatPushMessage} from '../../wechat/types.js';

const WAIT_IMAGE_TTL_MS = 2 * 60 * 1000;
const TRIGGER_KEYWORDS = ['识图', '解析图片', '看图'];
const AI_RECOGNIZE_URL = 'https://api.pearktrue.cn/api/airecognizeimg';

interface AiRecognizeResponse {
    code?: number;
    msg?: string;
    result?: string;
}

interface WechatCdnImageMeta {
    fileId: string;
    fileAesKey: string;
}

// 会话级别的待处理状态：key -> 过期时间戳（ms）
const pendingImageBySession = new Map<string, number>();

function getSessionKey(message: { from: string; room?: { id: string } }): string {
    return message.room?.id ? `${message.room.id}:${message.from}` : message.from;
}

function purgeExpiredPending(now: number): void {
    for (const [key, expiresAt] of pendingImageBySession.entries()) {
        if (expiresAt <= now) pendingImageBySession.delete(key);
    }
}

function hasPendingIntent(message: { from: string; room?: { id: string } }): boolean {
    const now = Date.now();
    purgeExpiredPending(now);
    const expiresAt = pendingImageBySession.get(getSessionKey(message));
    return Boolean(expiresAt && expiresAt > now);
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function isCommaNumberBytes(value: string): boolean {
    return /^\s*\d+(\s*,\s*\d+)+\s*$/.test(value);
}

function commaNumberBytesToUint8Array(value: string): Uint8Array {
    const bytes = value
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);
    return Uint8Array.from(bytes);
}

function buildRecognizeRequest(mediaId: string): { body: BodyInit; headers?: Record<string, string> } {
    if (isHttpUrl(mediaId)) {
        return {
            body: JSON.stringify({file: mediaId}),
            headers: {'Content-Type': 'application/json'},
        };
    }

    if (isCommaNumberBytes(mediaId)) {
        const bytes = commaNumberBytesToUint8Array(mediaId);
        const form = new FormData();
        form.append('file', new Blob([bytes], {type: 'application/octet-stream'}), 'wechat-image.bin');
        return {body: form};
    }

    return {
        // 兼容 data-url 或纯 base64 字符串
        body: JSON.stringify({file: mediaId}),
        headers: {'Content-Type': 'application/json'},
    };
}

function getFirstRawWechatItem(raw: unknown): WechatPushItem | null {
    const payload = raw as WechatPushMessage;
    const first = payload?.new_messages?.[0];
    return first ?? null;
}

function stripGroupPrefix(content: string): string {
    const separatorIndex = content.indexOf(':\n');
    if (separatorIndex <= 0) return content;
    return content.slice(separatorIndex + 2);
}

function pickXmlAttr(xml: string, attr: string): string | undefined {
    const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() || undefined;
}

function extractWechatCdnImageMeta(raw: unknown): WechatCdnImageMeta | null {
    const item = getFirstRawWechatItem(raw);
    if (!item || item.type !== 3) return null;

    const xml = stripGroupPrefix(item.content?.value ?? '').trim();
    if (!xml.includes('<img')) return null;

    const fileAesKey = pickXmlAttr(xml, 'aeskey');
    const fileId =
        pickXmlAttr(xml, 'cdnbigimgurl') ||
        pickXmlAttr(xml, 'cdnmidimgurl') ||
        pickXmlAttr(xml, 'cdnthumburl');

    if (!fileAesKey || !fileId) return null;
    return {fileId, fileAesKey};
}

async function resolveImageDataForRecognize(
    message: Parameters<ImageMessage['handle']>[0],
    env: Parameters<ImageMessage['handle']>[1],
): Promise<string | null> {
    if (message.mediaId?.trim()) return message.mediaId.trim();

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    if (!apiBaseUrl) return null;

    const cdnMeta = extractWechatCdnImageMeta(message.raw);
    if (!cdnMeta) return null;

    try {
        const api = new WechatApi(apiBaseUrl);
        const res = await api.cdnDownloadImage({
            file_id: cdnMeta.fileId,
            file_aes_key: cdnMeta.fileAesKey,
        });
        const base64 = typeof res.data === 'string' ? res.data.trim() : '';
        if (!base64) {
            logger.warn('微信 CDN 下载图片返回为空', {fileId: cdnMeta.fileId});
            return null;
        }
        return base64;
    } catch (error) {
        logger.error('微信 CDN 下载图片失败', error);
        return null;
    }
}

export const imageIntentTriggerPlugin: TextMessage = {
    type: 'text',
    name: 'image-intent-trigger',
    description: '识图入口：收到指令后等待图片',
    match: (content) => TRIGGER_KEYWORDS.some((k) => content.includes(k)),
    handle: async (message) => {
        pendingImageBySession.set(getSessionKey(message), Date.now() + WAIT_IMAGE_TTL_MS);
        return {
            type: 'text',
            content: '请在2分钟内发送一张图片，我会按识图流程处理。',
        };
    },
};

export const imageIntentProcessPlugin: ImageMessage = {
    type: 'image',
    name: 'image-intent-process',
    description: '处理识图流程中的图片消息',
    match: (message) => hasPendingIntent(message),
    handle: async (message, env) => {
        pendingImageBySession.delete(getSessionKey(message));
        const imageData = await resolveImageDataForRecognize(message, env);
        if (!imageData) {
            return {
                type: 'text',
                content: '收到图片，但未获取到可处理的数据。',
            };
        }

        try {
            const request = buildRecognizeRequest(imageData);
            const res = await fetch(AI_RECOGNIZE_URL, {
                method: 'POST',
                headers: request.headers,
                body: request.body,
            });

            if (!res.ok) {
                logger.error('AI 识图接口请求失败', {status: res.status});
                return {
                    type: 'text',
                    content: '识图失败了，请稍后重试。',
                };
            }

            const data = (await res.json()) as AiRecognizeResponse;
            const result = (data.result ?? '').trim();
            if (!result) {
                logger.warn('AI 识图接口未返回 result', {payload: data});
                return {
                    type: 'text',
                    content: '识图完成，但没有拿到有效描述。',
                };
            }

            return {
                type: 'text',
                content: `识图结果：${result}`,
            };
        } catch (error) {
            logger.error('调用 AI 识图接口异常', error);
            return {
                type: 'text',
                content: '识图时发生异常，请稍后再试。',
            };
        }
    },
};

export function clearImageIntentStateForTest(): void {
    pendingImageBySession.clear();
}

