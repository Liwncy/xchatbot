import type { TextMessage } from '../types.js';

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
 * AI dialogue plugin.
 *
 * Triggered when text contains "小聪明儿". It forwards the user text to a
 * configurable AI endpoint and replies with the generated content.
 */
export const aiPlugin: TextMessage = {
  type: 'text',
  name: 'ai-dialog',
  description: '文本包含"小聪明儿"时调用 AI 接口回复',

  match: (content) => content.includes('小聪明儿'),

  handle: async (message, env) => {
    const apiUrl = env.AI_API_URL?.trim();
    if (!apiUrl) {
      return { type: 'text', content: 'AI 服务未配置（缺少 AI_API_URL）。' };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
            { role: 'system', content: '你是一个简洁、友好的聊天助手。' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        return { type: 'text', content: 'AI 服务暂时不可用，请稍后再试。' };
      }

      const data = (await res.json()) as OpenAiLikeResponse;
      const reply = normalizeAiText(data);
      if (!reply) {
        return { type: 'text', content: 'AI 暂时没有返回可用内容。' };
      }

      return { type: 'text', content: reply };
    } catch {
      return { type: 'text', content: '调用 AI 服务失败，请稍后再试。' };
    }
  },
};
