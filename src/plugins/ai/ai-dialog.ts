import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {requestAiText} from '../common/ai-client.js';

/**
 * AI 对话插件。
 *
 * 当文本包含"小聪明儿"时触发，将用户文本转发到可配置的 AI 接口并以生成内容回复。
 */
export const aiDialogPlugin: TextMessage = {
    type: 'text',
    name: 'ai-dialog',
    description: '提到“小聪明儿”时由 AI 回复',

    match: (content) => content.includes('小聪明儿'),

    handle: async (message, env) => {
        const apiUrl = env.AI_API_URL?.trim();
        if (!apiUrl) {
            logger.error('AI 服务未配置（缺少 AI_API_URL）');
            return null;
        }

        try {
            const prompt = (message.content ?? '').trim();
            const reply = await requestAiText(env, {
                input: prompt,
                systemPrompt: env.AI_SYSTEM_PROMPT?.trim() || '你是我的智能助手，协助我回答问题和提供信息。',
            });
            if (!reply) {
                logger.warn('AI 服务未返回可用内容', {prompt, url: apiUrl});
                return null;
            }

            return {type: 'text', content: reply};
        } catch (err) {
            logger.error('调用 AI 服务时发生异常', {
                url: apiUrl,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    },
};
