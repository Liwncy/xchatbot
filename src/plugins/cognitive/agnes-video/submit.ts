import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import type {RecognizeImageInput, WechatCdnImageMeta} from '../intent-image/types.js';
import {createAgnesVideoTask} from './client.js';
import type {AgnesVideoConfig} from './config.js';
import {generateTextVideoThumbUrl} from './cover.js';
import {saveAgnesVideoTicket} from './storage.js';
import type {AgnesVideoTaskMode, AgnesVideoTicketRecord} from './types.js';

export interface SubmitAgnesVideoTaskParams {
    config: AgnesVideoConfig;
    env: Env;
    prompt: string;
    sourceImage?: RecognizeImageInput;
    /** 引用图片已有的微信 CDN 参数，跳过下载与重复上传。 */
    sourceImageMeta?: WechatCdnImageMeta;
    from: string;
    roomId?: string;
    mode: AgnesVideoTaskMode;
}

export async function submitAgnesVideoTask(
    params: SubmitAgnesVideoTaskParams,
): Promise<AgnesVideoTicketRecord> {
    const isImageToVideo = Boolean(params.sourceImage || params.sourceImageMeta);

    const [taskResult, textThumbUrl] = await Promise.all([
        createAgnesVideoTask(params.env, params.config, params.prompt, {
            sourceImage: params.sourceImage,
            sourceImageMeta: params.sourceImageMeta,
        }),
        isImageToVideo ? Promise.resolve(undefined) : generateTextVideoThumbUrl(params.prompt),
    ]);

    const thumbUrl = taskResult.sourceImageUrl ?? textThumbUrl;
    if (thumbUrl) {
        logger.info('绘影封面已就绪', {
            mode: params.mode,
            source: isImageToVideo ? 'reference-image' : 'baidu-draw',
        });
    }

    return saveAgnesVideoTicket(params.env, {
        videoId: taskResult.created.video_id!.trim(),
        taskId: taskResult.created.task_id ?? taskResult.created.id,
        prompt: params.prompt,
        from: params.from,
        roomId: params.roomId,
        mode: params.mode,
        thumbUrl,
    });
}
