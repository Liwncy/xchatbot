import {logger} from '../../../utils/logger.js';
import type {AgnesTextConfig} from './config.js';
import {
    AGNES_TEXT_CHAT_COMPLETIONS_PATH,
    AGNES_TEXT_EMOJI_NAME_SYSTEM_PROMPT,
    AGNES_TEXT_MODEL,
    AGNES_TEXT_REQUEST_TIMEOUT_MS,
} from './constants.js';
import type {
    AgnesTextChatCompletionRequest,
    AgnesTextChatCompletionResponse,
    AgnesTextChatMessage,
    AgnesTextMessageContent,
} from './types.js';

export interface RequestAgnesTextOptions {
    userText: string;
    systemPrompt?: string;
    imageUrl?: string;
    temperature?: number;
    maxTokens?: number;
}

function buildUserContent(userText: string, imageUrl?: string): AgnesTextMessageContent {
    const text = userText.trim();
    const url = imageUrl?.trim();
    if (!url) return text;

    return [
        {type: 'text', text: text || '请分析这张图片。'},
        {type: 'image_url', image_url: {url}},
    ];
}

export async function requestAgnesTextCompletion(
    config: AgnesTextConfig,
    options: RequestAgnesTextOptions,
): Promise<string | null> {
    const messages: AgnesTextChatMessage[] = [];
    const systemPrompt = options.systemPrompt?.trim();
    if (systemPrompt) {
        messages.push({role: 'system', content: systemPrompt});
    }

    messages.push({
        role: 'user',
        content: buildUserContent(options.userText, options.imageUrl),
    });

    const body: AgnesTextChatCompletionRequest = {
        model: AGNES_TEXT_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        stream: false,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGNES_TEXT_REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${config.baseUrl}${AGNES_TEXT_CHAT_COMPLETIONS_PATH}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
            throw new Error(`Agnes chat status=${res.status} detail=${detail}`);
        }

        const payload = (await res.json()) as AgnesTextChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content?.trim();
        return content || null;
    } finally {
        clearTimeout(timeout);
    }
}

/** 根据公网图片 URL 生成 2-4 字表情名（供表情收藏等场景复用）。 */
export async function requestAgnesEmojiShortName(
    config: AgnesTextConfig,
    imageUrl: string,
): Promise<string | null> {
    const raw = await requestAgnesTextCompletion(config, {
        systemPrompt: AGNES_TEXT_EMOJI_NAME_SYSTEM_PROMPT,
        userText: '请为这个表情起一个简短的中文名称。',
        imageUrl,
        temperature: 0.3,
        maxTokens: 32,
    });
    if (!raw) return null;

    const normalized = raw
        .replace(/[「」"'“”‘’]/g, '')
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
        .trim();
    logger.info('Agnes 表情起名结果', {raw, normalized});
    return normalized || null;
}
