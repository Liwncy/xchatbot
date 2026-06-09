import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import {FileUploader} from '../../../utils/file-uploader.js';
import {logger} from '../../../utils/logger.js';
import {
    resolveImageDataForRecognize,
    resolveImageDataFromMeta,
} from '../intent-image/recognize.js';
import type {RecognizeImageInput} from '../intent-image/types.js';

const WECHAT_CDN_HOST_PATTERN = /(?:vweixinf\.tc\.qq\.com|qpic\.cn|wx\.qq\.com)/i;

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

async function uploadRecognizeInputToPublicUrl(input: RecognizeImageInput): Promise<string | null> {
    const uploadOptions = {
        fileName: `agnes-text-${Date.now()}.png`,
        contentType: 'image/png',
    };

    if (input.kind === 'url' && isHttpUrl(input.value)) {
        if (!WECHAT_CDN_HOST_PATTERN.test(input.value)) {
            return input.value;
        }
        try {
            const res = await fetch(input.value);
            if (!res.ok) {
                logger.warn('Agnes 拉图：微信 CDN fetch 失败', {status: res.status, url: input.value});
                return null;
            }
            const blob = await res.blob();
            return FileUploader.upload(blob, {
                fileName: `agnes-text-${Date.now()}.gif`,
                contentType: blob.type || 'image/gif',
            });
        } catch (error) {
            logger.warn('Agnes 拉图：微信 CDN fetch 异常', {
                url: input.value,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    if (input.kind === 'blob') {
        const contentType = input.value.type || 'image/png';
        const ext = contentType.includes('gif') ? 'gif' : 'png';
        return FileUploader.upload(input.value, {
            fileName: `agnes-text-${Date.now()}.${ext}`,
            contentType,
        });
    }

    return FileUploader.upload(input.value, uploadOptions);
}

export async function resolvePublicImageUrlForAgnes(
    input: RecognizeImageInput,
): Promise<string | null> {
    return uploadRecognizeInputToPublicUrl(input);
}

export async function resolvePublicImageUrlFromMessage(
    message: IncomingMessage,
    env: Env,
): Promise<string | null> {
    const imageData = await resolveImageDataForRecognize(message, env);
    if (!imageData) return null;
    return resolvePublicImageUrlForAgnes(imageData);
}

export async function resolvePublicImageUrlFromMeta(
    imageMeta: NonNullable<IncomingMessage['quote']>['imageMeta'],
    env: Env,
): Promise<string | null> {
    if (!imageMeta) return null;
    const imageData = await resolveImageDataFromMeta(imageMeta, env);
    if (!imageData) return null;
    return resolvePublicImageUrlForAgnes(imageData);
}

export async function resolvePublicImageUrlFromEmojiCdnurl(cdnurl: string): Promise<string | null> {
    const trimmed = cdnurl.trim();
    if (!isHttpUrl(trimmed)) return null;
    return resolvePublicImageUrlForAgnes({kind: 'url', value: trimmed});
}
