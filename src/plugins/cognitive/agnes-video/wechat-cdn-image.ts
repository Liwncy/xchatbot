import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import {FileUploader, WechatImageUploader} from '../../../utils/file-uploader.js';
import {resolveImageDataFromMeta} from '../intent-image/recognize.js';
import type {RecognizeImageInput, WechatCdnImageMeta} from '../intent-image/types.js';
import {
    AGNES_VIDEO_QUOTE_IMAGE_URL_MODE,
    XCHATBOT_PUBLIC_BASE_URL,
} from './constants.js';

/** GET 代理路径，内部 POST 调微信网关 CDN 下载。 */
export const WECHAT_IMAGE_PROXY_PATH = '/proxy/wechat-image';

function resolveWorkerPublicBaseUrl(env: Env): string {
    const fromEnv = env.TURNSTILE_BASE_URL?.trim();
    return (fromEnv || XCHATBOT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function resolveWechatApiBaseUrl(env: Env): string | null {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    return apiBaseUrl || null;
}

export function buildWechatImageProxyUrl(
    workerBaseUrl: string,
    meta: WechatCdnImageMeta,
): string {
    const url = new URL(WECHAT_IMAGE_PROXY_PATH, `${workerBaseUrl.replace(/\/+$/, '')}/`);
    url.searchParams.set('id', meta.fileId);
    url.searchParams.set('key', meta.fileAesKey);
    return url.toString();
}

async function uploadToWechatCdn(
    apiBaseUrl: string,
    sourceImage: RecognizeImageInput,
): Promise<WechatCdnImageMeta | null> {
    const uploader = new WechatImageUploader(apiBaseUrl);

    if (sourceImage.kind === 'url') {
        const uploaded = await uploader.uploadImage({imageUrl: sourceImage.value});
        if (!uploaded) return null;
        return {fileId: uploaded.fileId, fileAesKey: uploaded.aesKey};
    }

    if (sourceImage.kind === 'blob') {
        const uploaded = await uploader.uploadImage({image: sourceImage.value});
        if (!uploaded) return null;
        return {fileId: uploaded.fileId, fileAesKey: uploaded.aesKey};
    }

    if (sourceImage.kind === 'base64') {
        const uploaded = await uploader.uploadImage({image: sourceImage.value});
        if (!uploaded) return null;
        return {fileId: uploaded.fileId, fileAesKey: uploaded.aesKey};
    }

    return null;
}

async function uploadRecognizeInputToUpfile(input: RecognizeImageInput): Promise<string | null> {
    const uploadOptions = {
        fileName: `agnes-video-ref-${Date.now()}.png`,
        contentType: 'image/png',
    };

    if (input.kind === 'url' && /^https?:\/\//i.test(input.value)) {
        return input.value;
    }

    if (input.kind === 'blob') {
        return FileUploader.upload(input.value, uploadOptions);
    }

    return FileUploader.upload(input.value, uploadOptions);
}

async function resolveUpfilePublicImageUrl(
    env: Env,
    options: {
        sourceImageMeta?: WechatCdnImageMeta;
        sourceImage?: RecognizeImageInput;
    },
): Promise<string | null> {
    let input = options.sourceImage;
    if (!input && options.sourceImageMeta) {
        input = (await resolveImageDataFromMeta(options.sourceImageMeta, env)) ?? undefined;
    }
    if (!input) return null;

    const publicUrl = await uploadRecognizeInputToUpfile(input);
    if (publicUrl) {
        logger.info('绘影引用图已上传公网图床', {publicUrl});
    }
    return publicUrl;
}

async function resolveWorkerProxyImageUrl(
    env: Env,
    options: {
        sourceImageMeta?: WechatCdnImageMeta;
        sourceImage?: RecognizeImageInput;
    },
): Promise<string | null> {
    const workerBaseUrl = resolveWorkerPublicBaseUrl(env);
    const apiBaseUrl = resolveWechatApiBaseUrl(env);
    if (!apiBaseUrl) return null;

    let meta = options.sourceImageMeta;
    if (!meta?.fileId || !meta.fileAesKey) {
        const sourceImage = options.sourceImage;
        if (!sourceImage) return null;
        meta = (await uploadToWechatCdn(apiBaseUrl, sourceImage)) ?? undefined;
    }

    if (!meta?.fileId || !meta.fileAesKey) return null;

    const proxyUrl = buildWechatImageProxyUrl(workerBaseUrl, meta);
    logger.info('绘影引用图使用 Worker 代理 URL', {proxyUrl});
    return proxyUrl;
}

/** 解析引用图传给 Agnes 的 image URL，模式见 AGNES_VIDEO_QUOTE_IMAGE_URL_MODE。 */
export async function resolveWechatCdnImageUrl(
    env: Env,
    options: {
        sourceImageMeta?: WechatCdnImageMeta;
        sourceImage?: RecognizeImageInput;
    },
): Promise<string | null> {
    const mode = AGNES_VIDEO_QUOTE_IMAGE_URL_MODE;
    logger.info('绘影引用图 URL 模式', {mode});

    if (mode === 'upfile') {
        return resolveUpfilePublicImageUrl(env, options);
    }

    return resolveWorkerProxyImageUrl(env, options);
}
