import {DrawService} from '../../common/draw-service.js';
import {logger} from '../../../utils/logger.js';

/** 与默认绘影分辨率 1152×768 接近的横版封面比例 */
const TEXT_VIDEO_COVER_SCALE = '16:9';

function buildCoverPrompt(prompt: string): string {
    return `${prompt}，数字艺术插画风格，主体清晰，构图完整，高清，适合视频封面`;
}

export async function generateTextVideoThumbUrl(prompt: string): Promise<string | undefined> {
    const trimmed = prompt.trim();
    if (!trimmed) return undefined;

    try {
        const coverUrl = await DrawService.draw(buildCoverPrompt(trimmed), {
            scale: TEXT_VIDEO_COVER_SCALE,
        });
        logger.info('绘影文生视频封面已生成', {promptLength: trimmed.length, coverUrl});
        return coverUrl;
    } catch (error) {
        logger.warn('绘影文生视频封面生成失败，将使用默认封面', {
            promptLength: trimmed.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
    }
}
