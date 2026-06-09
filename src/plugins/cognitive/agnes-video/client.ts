import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import type {RecognizeImageInput, WechatCdnImageMeta} from '../intent-image/types.js';
import {
    AGNES_VIDEO_CREATE_TIMEOUT_MS,
    AGNES_VIDEO_MODEL,
} from './constants.js';
import type {AgnesVideoConfig} from './config.js';
import type {
    AgnesVideoCreateRequest,
    AgnesVideoCreateResponse,
    AgnesVideoQueryResponse,
} from './types.js';
import {resolveWechatCdnImageUrl} from './wechat-cdn-image.js';

function buildCreateBody(
    config: AgnesVideoConfig,
    prompt: string,
    imageUrl?: string,
): AgnesVideoCreateRequest {
    const body: AgnesVideoCreateRequest = {
        model: AGNES_VIDEO_MODEL,
        prompt,
        height: config.height,
        width: config.width,
        num_frames: config.numFrames,
        frame_rate: config.frameRate,
    };
    if (imageUrl) body.image = imageUrl;
    return body;
}

export interface CreateAgnesVideoTaskResult {
    created: AgnesVideoCreateResponse;
    /** 图生视频时微信 CDN 图片的可访问 URL，用作封面。 */
    sourceImageUrl?: string;
}

export interface CreateAgnesVideoTaskOptions {
    sourceImage?: RecognizeImageInput;
    /** 引用消息已有的 CDN 参数，可跳过下载与重复上传。 */
    sourceImageMeta?: WechatCdnImageMeta;
}

export async function createAgnesVideoTask(
    env: Env,
    config: AgnesVideoConfig,
    prompt: string,
    options?: CreateAgnesVideoTaskOptions,
): Promise<CreateAgnesVideoTaskResult> {
    let sourceImageUrl: string | undefined;
    const sourceImage = options?.sourceImage;
    const sourceImageMeta = options?.sourceImageMeta;
    if (sourceImage || sourceImageMeta) {
        sourceImageUrl = (await resolveWechatCdnImageUrl(env, {
            sourceImage,
            sourceImageMeta,
        })) ?? undefined;
        if (!sourceImageUrl) {
            throw new Error('引用图片未能转换为可访问 URL');
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGNES_VIDEO_CREATE_TIMEOUT_MS);

    try {
        const res = await fetch(`${config.baseUrl}/v1/videos`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildCreateBody(config, prompt, sourceImageUrl)),
            signal: controller.signal,
        });

        if (!res.ok) {
            const detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
            throw new Error(`聪明绘影任务提交失败 status=${res.status} detail=${detail}`);
        }

        const payload = (await res.json()) as AgnesVideoCreateResponse;
        if (!payload.video_id?.trim()) {
            logger.error('聪明绘影任务提交未返回 video_id', {
                payload: JSON.stringify(payload).slice(0, 300),
            });
            throw new Error('聪明绘影任务提交异常，请稍后重试');
        }

        logger.info('Agnes 视频任务已创建', {
            videoId: payload.video_id,
            taskId: payload.task_id ?? payload.id,
            status: payload.status,
        });
        return {created: payload, sourceImageUrl};
    } catch (error) {
        const aborted =
            (error instanceof Error && error.name === 'AbortError') ||
            (error instanceof Error && /aborted/i.test(error.message));
        if (aborted) {
            throw new Error(
                `聪明绘影任务提交超时（${Math.round(AGNES_VIDEO_CREATE_TIMEOUT_MS / 1000)}s），请稍后重试`,
            );
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function queryAgnesVideoTask(
    config: AgnesVideoConfig,
    videoId: string,
): Promise<AgnesVideoQueryResponse> {
    const url = new URL(`${config.baseUrl}/agnesapi`);
    url.searchParams.set('video_id', videoId);
    url.searchParams.set('model_name', AGNES_VIDEO_MODEL);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
        },
    });

    if (!res.ok) {
        const detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
        throw new Error(`聪明绘影查询失败 status=${res.status} detail=${detail}`);
    }

    return (await res.json()) as AgnesVideoQueryResponse;
}
