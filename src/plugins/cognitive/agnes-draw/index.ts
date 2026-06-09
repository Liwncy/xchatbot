import type {TextMessage} from '../../types.js';
import {logger} from '../../../utils/logger.js';
import {generateTextToImage} from './client.js';
import {AGNES_TEXT_DRAW_KEYWORDS} from './constants.js';
import {resolveAgnesDrawConfig} from './config.js';
import {
    buildTextToImagePrompt,
    extractPromptAfterKeyword,
} from './prompt.js';
import {buildImageReply} from './reply.js';

export {handleAgnesQuoteDraw, matchesAgnesQuoteDraw} from './quote.js';

function buildUsageHint(): string {
    return [
        '用法示例：',
        '· 聪明绘图 一个戴草帽的机器人在海边看日落',
        '· 引用文字并发送「聪明绘图」→ 文生图（可用标题补充描述）',
        '· 引用图片并发送「聪明绘图 改成赛博朋克」→ 图生图',
    ].join('\n');
}

export const agnesDrawPlugin: TextMessage = {
    type: 'text',
    name: 'agnes-draw',
    description: '聪明绘图/聪明文绘图走 Agnes 文生图',
    match: (content) => AGNES_TEXT_DRAW_KEYWORDS.some((keyword) => content.trim().startsWith(keyword)),
    handle: async (message, env) => {
        const promptText = extractPromptAfterKeyword(message.content ?? '', AGNES_TEXT_DRAW_KEYWORDS);
        if (!promptText) {
            return {
                type: 'text',
                content: `请在触发词后面加上画面描述。\n${buildUsageHint()}`,
            };
        }

        const config = resolveAgnesDrawConfig(env);
        if (!config) {
            return {type: 'text', content: 'Agnes 绘图未配置 API Key，请联系管理员。'};
        }

        const prompt = buildTextToImagePrompt(promptText);
        try {
            const image = await generateTextToImage(config, prompt);
            return buildImageReply(image);
        } catch (error) {
            logger.error('Agnes 文生图失败', {
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
