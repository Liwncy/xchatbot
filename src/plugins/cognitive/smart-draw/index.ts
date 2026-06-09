import type {TextMessage} from '../../types.js';
import {logger} from '../../../utils/logger.js';
import {DrawService} from '../../common/draw-service.js';

type ImageReplyScale = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';

const SMART_DRAW_PREFIX = '百度绘图';
const DEFAULT_DRAW_SCALE: ImageReplyScale = '1:1';

function extractPrompt(content: string): string {
    const trimmed = content.trim();
    if (!trimmed.startsWith(SMART_DRAW_PREFIX)) return '';

    return trimmed
        .slice(SMART_DRAW_PREFIX.length)
        .replace(/^[\s,，。.!！:：;；、~-]+/, '')
        .trim();
}

function buildFallbackPrompt(requestText: string): string {
    return `${requestText}，数字艺术插画风格，主体清晰，构图完整，高清，细节丰富`;
}

export const smartDrawPlugin: TextMessage = {
    type: 'text',
    name: 'smart-draw',
    description: '以"百度绘图"开头，走百度 AI 绘图',
    match: (content) => content.trim().startsWith(SMART_DRAW_PREFIX),
    handle: async (message) => {
        const promptText = extractPrompt(message.content ?? '');
        if (!promptText) {
            return {
                type: 'text',
                content: '请在“百度绘图”后面加上描述，例如：百度绘图 一个戴草帽的机器人在海边看日落',
            };
        }

        const prompt = buildFallbackPrompt(promptText);
        try {
            const imageUrl = await DrawService.draw(prompt, {scale: DEFAULT_DRAW_SCALE});
            return {
                type: 'image',
                mediaId: imageUrl,
                originalUrl: imageUrl,
            };
        } catch (error) {
            logger.error('百度绘图插件生成失败', {
                promptText,
                prompt,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: '这张没画出来，换个描述试试？',
            };
        }
    },
};
