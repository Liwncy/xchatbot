import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';

interface OpenAiLikeChoice {
    message?: {
        content?: string;
    };
}

interface OpenAiLikeResponse {
    choices?: OpenAiLikeChoice[];
    output_text?: string;
    reply?: string;
}

function normalizeAiText(data: OpenAiLikeResponse): string | null {
    const fromChoices = data.choices?.[0]?.message?.content?.trim();
    if (fromChoices) return fromChoices;

    const fromOutputText = data.output_text?.trim();
    if (fromOutputText) return fromOutputText;

    const fromReply = data.reply?.trim();
    if (fromReply) return fromReply;

    return null;
}

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
            const headers: Record<string, string> = {'Content-Type': 'application/json'};
            if (env.AI_API_KEY?.trim()) {
                headers.Authorization = `Bearer ${env.AI_API_KEY.trim()}`;
            }

            const prompt = (message.content ?? '').trim();
            const model = env.AI_MODEL?.trim() || 'gpt-4o-mini';

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    input: prompt,
                    messages: [
                        {
                            role: 'system',
                            content: env.AI_SYSTEM_PROMPT?.trim() || '你是我的智能助手，协助我回答问题和提供信息。'
                        },
                        {role: 'user', content: prompt},
                    ],
                }),
            });

            if (!res.ok) {
                logger.error('AI 服务响应异常', {status: res.status, url: apiUrl});
                return null;
            }

            const data = (await res.json()) as OpenAiLikeResponse;
            const reply = normalizeAiText(data);
            if (!reply) {
                logger.warn('AI 服务未返回可用内容', {data});
                return null;
            }

            return {type: 'text', content: reply};
        } catch (err) {
            logger.error('调用 AI 服务时发生异常', err);
            return null;
        }
    },
};
