import type {Env} from '../../../types/env.js';
import {WechatImageUploader} from '../../../utils/file-uploader.js';
import type {RecognizeImageInput, WechatCdnImageMeta} from '../intent-image/types.js';
import {XCHATBOT_PUBLIC_BASE_URL} from './constants.js';

/** GET 代理路径，内部 POST 调微信网关 CDN 下载。 */
export const WECHAT_IMAGE_PROXY_PATH = '/proxy/wechat-image';

function resolveWorkerPublicBaseUrl(env: Env): string {
    const fromEnv = env.TURNSTILE_BASE_URL?.trim();
    return (fromEnv || XCHATBOT_PUBLIC_BASE_URL).replace(/\/+$/, '');
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

function resolveWechatApiBaseUrl(env: Env): string | null {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    return apiBaseUrl || null;
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

export async function resolveWechatCdnImageUrl(
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

    return buildWechatImageProxyUrl(workerBaseUrl, meta);
}
