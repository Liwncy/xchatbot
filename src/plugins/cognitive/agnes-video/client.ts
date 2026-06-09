import {logger} from '../../../utils/logger.js';
import {FileUploader} from '../../../utils/file-uploader.js';
import type {RecognizeImageInput} from '../intent-image/types.js';
import {
    AGNES_VIDEO_MODEL,
} from './constants.js';
import type {AgnesVideoConfig} from './config.js';
import type {
    AgnesVideoCreateRequest,
    AgnesVideoCreateResponse,
    AgnesVideoQueryResponse,
} from './types.js';

async function toPublicImageUrl(input: RecognizeImageInput): Promise<string | null> {
    if (input.kind === 'url' && /^https?:\/\//i.test(input.value)) {
        return input.value;
    }

    if (input.kind === 'blob') {
        return FileUploader.upload(input.value, {
            fileName: `agnes-video-ref-${Date.now()}.png`,
            contentType: 'image/png',
        });
    }

    return FileUploader.upload(input.value, {
        fileName: `agnes-video-ref-${Date.now()}.png`,
        contentType: 'image/png',
    });
}

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
    /** 图生视频时上传到 CDN 的引用图 URL，用作封面。 */
    sourceImageUrl?: string;
}

export async function createAgnesVideoTask(
    config: AgnesVideoConfig,
    prompt: string,
    sourceImage?: RecognizeImageInput,
): Promise<CreateAgnesVideoTaskResult> {
    let sourceImageUrl: string | undefined;
    if (sourceImage) {
        sourceImageUrl = (await toPublicImageUrl(sourceImage)) ?? undefined;
        if (!sourceImageUrl) {
            throw new Error('引用图片未能转换为可访问 URL');
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.createTimeoutMs);

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
                `聪明绘影任务提交超时（${Math.round(config.createTimeoutMs / 1000)}s），请稍后重试`,
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
