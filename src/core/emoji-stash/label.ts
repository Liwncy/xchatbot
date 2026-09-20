import {LLM_PROMPTS, requestLlmJson} from '../llm/index.js';
import type {Env} from '../../types/env.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {logger} from '../../utils/logger.js';
import {
    isEmojiStashCategory,
    type EmojiStashCategory,
} from './categories.js';

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

function needsPublicCopy(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith('.qq.com') || host.endsWith('.weixin.qq.com');
    } catch {
        return true;
    }
}

async function publicImageUrl(imageUrl: string): Promise<string> {
    if (!needsPublicCopy(imageUrl)) return imageUrl;
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`图没拉下来 ${response.status}`);
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/gif';
    const uploaded = await FileUploader.upload(await response.arrayBuffer(), {
        fileName: mime.includes('gif') ? 'emoji.gif' : 'emoji.jpg',
        contentType: mime.includes('octet-stream') ? 'image/gif' : mime,
    });
    if (!uploaded) throw new Error('图没转出去');
    return uploaded;
}

export async function labelEmojiFromImage(env: Env, imageUrl: string): Promise<EmojiLabel | null> {
    const url = imageUrl.trim();
    if (!/^https?:\/\//iu.test(url)) return null;
    try {
        const raw = await requestLlmJson(env, {
            type: 'chat',
            system: LLM_PROMPTS.emojiLabel,
            user: '给这张表情写检索字段。',
            imageUrl: await publicImageUrl(url),
        });
        return raw ? normalizeLabel(raw) : null;
    } catch (error) {
        logger.warn('表情标签没写成', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
