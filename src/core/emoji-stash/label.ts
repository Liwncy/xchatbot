import {LLM_PROMPTS, requestLlmJson} from '../llm/index.js';
import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {
    isEmojiStashCategory,
    type EmojiStashCategory,
} from './categories.js';

const RECOGNIZE_URL = 'https://api.pearapi.ai/api/airecognizeimg';

export interface EmojiLabel {
    description: string;
    tags: string[];
    category: EmojiStashCategory;
}

function normalizeLabel(raw: Record<string, unknown>): EmojiLabel | null {
    const description = String(raw.description ?? '').replace(/\s+/gu, '').trim().slice(0, 16);
    const tags = Array.isArray(raw.tags)
        ? raw.tags
            .map((tag) => String(tag).replace(/[#[\]【】\s]/gu, '').trim())
            .filter((tag) => tag.length >= 1 && tag.length <= 8 && /[\u4e00-\u9fff]/u.test(tag))
            .filter((tag, index, list) => list.indexOf(tag) === index)
            .slice(0, 5)
        : [];
    const categoryRaw = String(raw.category ?? '').trim().toLowerCase();
    const category = isEmojiStashCategory(categoryRaw) ? categoryRaw : 'misc';
    if (!description || !/[\u4e00-\u9fff]/u.test(description) || tags.length < 2) return null;
    return {description, tags, category};
}

async function recognizeImage(imageUrl: string): Promise<string> {
    const response = await fetch(RECOGNIZE_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({file: imageUrl}),
    });
    if (!response.ok) {
        throw new Error(`识图失败 ${response.status}`);
    }
    const data = await response.json() as {result?: string};
    const result = data.result?.trim() ?? '';
    if (!result) throw new Error('识图没字');
    return result;
}

export async function labelEmojiFromImage(env: Env, imageUrl: string): Promise<EmojiLabel | null> {
    const url = imageUrl.trim();
    if (!/^https?:\/\//iu.test(url)) return null;
    try {
        const caption = await recognizeImage(url);
        const raw = await requestLlmJson(env, {
            system: LLM_PROMPTS.emojiLabel,
            user: caption.slice(0, 800),
        });
        return raw ? normalizeLabel(raw) : null;
    } catch (error) {
        logger.warn('表情标签没写成', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
