import type {TextMessage} from '../../types.js';
import {logger} from '../../../utils/logger.js';
import {DrawService} from '../../common/draw-service.js';

type ImageReplyScale = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';

/** 越长越优先，避免「快绘」被更短词截断 */
const TRIGGER_KEYWORDS = ['闪图', '快绘', '快画', '闪绘'] as const;
const DEFAULT_DRAW_SCALE: ImageReplyScale = '1:1';

function matchTrigger(content: string): string | null {
    const trimmed = content.trim();
    const matched = [...TRIGGER_KEYWORDS]
        .sort((a, b) => b.length - a.length)
        .find((keyword) => trimmed.startsWith(keyword));
    return matched ?? null;
}

function extractPrompt(content: string): string {
    const keyword = matchTrigger(content);
    if (!keyword) return '';

    return content
        .trim()
        .slice(keyword.length)
        .replace(/^[\s,，。.!！:：;；、~-]+/, '')
        .trim();
}

function enrichPrompt(requestText: string): string {
    return `${requestText}，数字艺术插画风格，主体清晰，构图完整，高清，细节丰富`;
}

export const quickDrawPlugin: TextMessage = {
    type: 'text',
    name: 'quick-draw',
    description: '以「闪图 / 快绘 / 快画 / 闪绘」开头，走共享快速绘图',
    match: (content) => matchTrigger(content) !== null,
    handle: async (message) => {
        const promptText = extractPrompt(message.content ?? '');
        if (!promptText) {
            return {
                type: 'text',
                content: '后面跟一句画面描述就行，比如：闪图 一只戴墨镜的猫',
            };
        }

        const prompt = enrichPrompt(promptText);
        try {
            const imageUrl = await DrawService.draw(prompt, {scale: DEFAULT_DRAW_SCALE});
            return {
                type: 'image',
                mediaId: imageUrl,
                originalUrl: imageUrl,
            };
        } catch (error) {
            logger.error('快速绘图失败', {
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
