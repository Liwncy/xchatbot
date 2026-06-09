import {arrayBufferToBase64} from '../../../utils/binary.js';
import {logger} from '../../../utils/logger.js';
import {
    AGNES_MODEL,
    AGNES_REQUEST_TIMEOUT_MS,
} from './constants.js';
import type {AgnesDrawConfig} from './config.js';
import type {AgnesImageGenerationRequest, AgnesImageGenerationResponse} from './types.js';
import type {RecognizeImageInput} from '../intent-image/types.js';

export interface AgnesGeneratedImage {
    url?: string;
    base64?: string;
}

async function toAgnesImageReference(input: RecognizeImageInput): Promise<string> {
    if (input.kind === 'url') return input.value;
    if (input.kind === 'base64') {
        const normalized = input.value.trim().replace(/^data:[^;]+;base64,/, '');
        return `data:image/png;base64,${normalized}`;
    }

    const buffer = await input.value.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
}

function pickGeneratedImage(payload: AgnesImageGenerationResponse): AgnesGeneratedImage | null {
    const first = payload.data?.[0];
    if (!first) return null;

    const url = first.url?.trim();
    if (url) return {url};

    const base64 = first.b64_json?.trim();
    if (base64) return {base64};

    return null;
}

async function requestAgnesGeneration(
    config: AgnesDrawConfig,
    body: AgnesImageGenerationRequest,
): Promise<AgnesGeneratedImage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGNES_REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${config.baseUrl}/v1/images/generations`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
            throw new Error(`Agnes API status=${res.status} detail=${detail}`);
        }

        const payload = (await res.json()) as AgnesImageGenerationResponse;
        const image = pickGeneratedImage(payload);
        if (!image) {
            throw new Error(`Agnes API 未返回图片数据: ${JSON.stringify(payload).slice(0, 300)}`);
        }

        return image;
    } finally {
        clearTimeout(timeout);
    }
}

export async function generateTextToImage(
    config: AgnesDrawConfig,
    prompt: string,
): Promise<AgnesGeneratedImage> {
    logger.info('Agnes 文生图请求', {size: config.size, promptLength: prompt.length});
    return requestAgnesGeneration(config, {
        model: AGNES_MODEL,
        prompt,
        size: config.size,
        extra_body: {
            response_format: 'url',
        },
    });
}

export async function generateImageToImage(
    config: AgnesDrawConfig,
    prompt: string,
    sourceImage: RecognizeImageInput,
): Promise<AgnesGeneratedImage> {
    const imageRef = await toAgnesImageReference(sourceImage);
    logger.info('Agnes 图生图请求', {size: config.size, promptLength: prompt.length});
    return requestAgnesGeneration(config, {
        model: AGNES_MODEL,
        prompt,
        size: config.size,
        extra_body: {
            image: [imageRef],
            response_format: 'url',
        },
    });
}
