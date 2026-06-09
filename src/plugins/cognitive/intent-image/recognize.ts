import type {ImageMessage} from '../../types.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {WechatApi} from '../../../wechat/api';
import type {WechatPushItem, WechatPushMessage} from '../../../wechat/types.js';
import type {AiRecognizeResponse, RecognizeImageInput, WechatCdnImageMeta} from './types.js';

export const AI_RECOGNIZE_URL = 'https://api.pearapi.ai/api/airecognizeimg';

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

export function buildRecognizeRequest(input: RecognizeImageInput): {body: BodyInit; headers?: Record<string, string>} {
    if (input.kind === 'url') {
        return {
            body: JSON.stringify({file: input.value}),
            headers: {'Content-Type': 'application/json'},
        };
    }

    if (input.kind === 'blob') {
        const form = new FormData();
        form.append('file', input.value, 'wechat-image.bin');
        return {body: form};
    }

    return {
        body: JSON.stringify({file: input.value}),
        headers: {'Content-Type': 'application/json'},
    };
}

function getFirstRawWechatItem(raw: unknown): WechatPushItem | null {
    const payload = raw as WechatPushMessage;
    const first = payload?.new_message?.[0];
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

export async function resolveImageDataFromMeta(
    cdnMeta: WechatCdnImageMeta,
    env: Parameters<ImageMessage['handle']>[1],
): Promise<RecognizeImageInput | null> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    if (!apiBaseUrl) return null;

    try {
        const api = new WechatApi(apiBaseUrl);
        const raw = await api.cdnDownloadImageRaw({
            id: cdnMeta.fileId,
            key: cdnMeta.fileAesKey,
        });
        if (raw.byteLength <= 0) {
            logger.warn('微信 CDN 下载图片返回为空', {fileId: cdnMeta.fileId});
            return null;
        }
        return {
            kind: 'blob',
            value: new Blob([raw], {type: 'application/octet-stream'}),
        };
    } catch (error) {
        logger.error('微信 CDN 下载图片失败', error);
        return null;
    }
}

export async function resolveImageDataForRecognize(
    message: Parameters<ImageMessage['handle']>[0],
    env: Parameters<ImageMessage['handle']>[1],
): Promise<RecognizeImageInput | null> {
    if (message.mediaId?.trim()) {
        const mediaId = message.mediaId.trim();
        return isHttpUrl(mediaId)
            ? {kind: 'url', value: mediaId}
            : {kind: 'base64', value: mediaId};
    }

    const cdnMeta = extractWechatCdnImageMeta(message.raw);
    if (!cdnMeta) return null;

    return resolveImageDataFromMeta(cdnMeta, env);
}

export async function runImageRecognize(imageData: RecognizeImageInput): Promise<HandlerResponse> {
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
                content: '这张图我没认出来，换一张试试？',
            };
        }

        const data = (await res.json()) as AiRecognizeResponse;
        const result = (data.result ?? '').trim();
        if (!result) {
            logger.warn('AI 识图接口未返回 result', {payload: data});
            return {
                type: 'text',
                content: '看了半天没看出个所以然，换一张再试试？',
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
            content: '看图的时候眼睛有点花，再发一次试试？',
        };
    }
}
