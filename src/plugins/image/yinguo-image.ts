import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {FileUploader} from '../../utils/file-uploader.js';

const TRIGGER_KEYWORDS = ['我与赌毒不共戴天', '因果循环', '佛祖心中住'] as const;

// 在这里直接维护接口配置，不依赖环境变量。
const YINGUO_IMAGE_API_URL = 'https://veil.ortlinde.com/v1/random';
const YINGUO_VERIFY_API_URL = 'https://api.pearapi.ai/api/pornimage/';
const YINGUO_SKETCH_API_URL = 'https://api.xingzhige.com/API/xian?url=';
const YINGUO_API_KEY = '';
const YINGUO_UPLOAD_VIP_CODE = '';

function getAuthHeaders(): HeadersInit {
    const token = YINGUO_API_KEY.trim();
    return token ? {Authorization: `Bearer ${token}`} : {};
}

function assertRequiredConfig(): void {
    if (!YINGUO_IMAGE_API_URL.trim()) throw new Error('请在 yinguo-image.ts 中设置 YINGUO_IMAGE_API_URL');
    if (!YINGUO_VERIFY_API_URL.trim()) throw new Error('请在 yinguo-image.ts 中设置 YINGUO_VERIFY_API_URL');
}

function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const dataUrlMatch = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return dataUrlMatch?.[1]?.trim() || trimmed;
}

function base64ToBlob(base64: string, contentType = 'image/jpeg'): Blob {
    const binary = atob(normalizeBase64(base64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], {type: contentType});
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function pickNumberField(obj: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = obj[key];
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num;
        }
    }
    return null;
}

function pickObjectField(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
    for (const key of keys) {
        const value = obj[key];
        if (value && typeof value === 'object') {
            return value as Record<string, unknown>;
        }
    }
    return null;
}

function resolveBase64FromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const direct = pickStringField(root, ['base64', 'imageBase64', 'imgBase64', 'image', 'img']);
    if (direct) return direct;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';
    return pickStringField(data, ['base64', 'imageBase64', 'imgBase64', 'image', 'img']);
}

function resolveUrlFromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const direct = pickStringField(root, ['url', 'link', 'imageUrl', 'imgUrl', 'data']);
    if (/^https?:\/\//i.test(direct)) return direct;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';

    const nested = pickStringField(data, ['url', 'link', 'imageUrl', 'imgUrl']);
    return /^https?:\/\//i.test(nested) ? nested : '';
}

function resolveScoreFromPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;

    const rootScore = pickNumberField(root, ['score', 'risk', 'riskScore', 'nsfw', 'toxicity']);
    if (rootScore !== null) return rootScore;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return null;
    return pickNumberField(data, ['score', 'risk', 'riskScore', 'nsfw', 'toxicity']);
}

function resolveClassificationFromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;

    const rootClassification = root.classification;
    if (typeof rootClassification === 'string' && rootClassification.trim()) {
        return rootClassification.trim();
    }

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';
    const nestedClassification = data.classification;
    if (typeof nestedClassification === 'string' && nestedClassification.trim()) {
        return nestedClassification.trim();
    }
    return '';
}

async function fetchImageBase64(): Promise<string> {
    const url = YINGUO_IMAGE_API_URL.trim();

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json, text/plain, */*',
            ...getAuthHeaders(),
        },
    });
    if (!response.ok) {
        throw new Error(`获取原图失败 status=${response.status}`);
    }

    const payload = await response.json();
    const base64 = resolveBase64FromPayload(payload);
    if (!base64) {
        throw new Error('原图接口未返回 base64');
    }
    return base64;
}

async function verifyImage(base64: string): Promise<{score: number | null; classification: string}> {
    const api = YINGUO_VERIFY_API_URL.trim();
    const form = new FormData();
    form.append('file', base64ToBlob(base64), `yinguo-${Date.now()}.jpg`);

    const response = await fetch(api, {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            ...getAuthHeaders(),
        },
        body: form,
    });
    if (!response.ok) {
        throw new Error(`图片验证失败 status=${response.status}`);
    }

    const payload = await response.json();
    return {
        score: resolveScoreFromPayload(payload),
        classification: resolveClassificationFromPayload(payload),
    };
}

async function createTempUrl(base64: string): Promise<string> {
    const tempUrl = await FileUploader.uploadBase64(base64, {
        fileName: `yinguo-${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        vipCode: YINGUO_UPLOAD_VIP_CODE,
    });
    if (!tempUrl) {
        throw new Error('临时链接生成失败');
    }
    return tempUrl;
}

async function toSketchImageByUrl(imageUrl: string): Promise<string | null> {
    const api = YINGUO_SKETCH_API_URL.trim();
    if (!api) return null;

    const requestUrl = `${api}${encodeURIComponent(imageUrl)}`;

    const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
            Accept: 'application/json, text/plain, */*',
            ...getAuthHeaders(),
        },
    });
    if (!response.ok) {
        throw new Error(`手绘转换失败 status=${response.status}`);
    }

    const payload = await response.json();
    const base64Result = resolveBase64FromPayload(payload);
    if (base64Result) return base64Result;

    const urlResult = resolveUrlFromPayload(payload);
    return urlResult || null;
}

function isPornClassification(value: string): boolean {
    return value.replace(/\s+/g, '') === '色情';
}

async function maybeConvertToSketch(base64: string, classification: string): Promise<string | null> {
    if (!isPornClassification(classification)) return null;

    const tempUrl = await createTempUrl(base64);
    const sketchImage = await toSketchImageByUrl(tempUrl);
    if (!sketchImage) {
        logger.warn('因果诱惑图片命中色情分类，但手绘接口未返回有效结果', {classification});
    }
    return sketchImage;
}

export const yinguoImagePlugin: TextMessage = {
    type: 'text',
    name: 'yinguo-image',
    description: '因果诱惑图片插件：关键词触发，取 base64 -> 临时链接 -> 验证，超阈值转手绘图',
    match: (content) => {
        const trimmed = content.trim();
        return TRIGGER_KEYWORDS.some((keyword) => trimmed.includes(keyword));
    },
    handle: async () => {
        try {
            assertRequiredConfig();
            const base64 = await fetchImageBase64();
            const verifyResult = await verifyImage(base64);
            const sketchImage = await maybeConvertToSketch(base64, verifyResult.classification);
            if (sketchImage) {
                logger.info('因果诱惑图片命中色情分类，已转手绘图', {
                    classification: verifyResult.classification,
                    score: verifyResult.score,
                });
                return {
                    type: 'image',
                    mediaId: sketchImage,
                    originalUrl: /^https?:\/\//i.test(sketchImage) ? sketchImage : undefined,
                };
            }

            return {
                type: 'image',
                mediaId: base64,
            };
        } catch (error) {
            logger.error('因果诱惑图片插件处理失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: '因果图片服务暂时不可用，请稍后再试。',
            };
        }
    },
};

