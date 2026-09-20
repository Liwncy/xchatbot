import {LLM_PROMPTS, requestLlmJson} from '../llm/index.js';
import type {Env} from '../../types/env.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {logger} from '../../utils/logger.js';
import {
    isEmojiStashCategory,
    type EmojiStashCategory,
} from './categories.js';
import {readImageMeta, type ImageMeta} from './image-meta.js';

export interface EmojiLabel {
    name: string;
    description: string;
    tags: string[];
    category: EmojiStashCategory;
    size?: number;
    width?: number | null;
    height?: number | null;
    mime?: string | null;
}

function normalizeChineseName(raw: unknown): string {
    const name = String(raw ?? '').replace(/\s+/gu, '').trim().slice(0, 8);
    return name && /[\u4e00-\u9fff]/u.test(name) ? name : '';
}

export function normalizeLabel(raw: Record<string, unknown>): EmojiLabel | null {
    const description = String(raw.description ?? '').replace(/\s+/gu, '').trim().slice(0, 36);
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
    const name = normalizeChineseName(raw.name) || description.slice(0, 8) || tags.slice(0, 2).join('');
    return {name, description, tags, category};
}

function needsPublicCopy(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith('.qq.com') || host.endsWith('.weixin.qq.com');
    } catch {
        return true;
    }
}

export async function prepareEmojiImage(imageUrl: string): Promise<{url: string; meta: ImageMeta}> {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`图没拉下来 ${response.status}`);
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/gif';
    const buffer = await response.arrayBuffer();
    const meta = readImageMeta(buffer, mime);
    if (!needsPublicCopy(imageUrl)) return {url: imageUrl, meta};
    const uploaded = await FileUploader.upload(buffer, {
        fileName: mime.includes('gif') ? 'emoji.gif' : 'emoji.jpg',
        contentType: mime.includes('octet-stream') ? 'image/gif' : mime,
    });
    if (!uploaded) throw new Error('图没转出去');
    return {url: uploaded, meta};
}

export async function inspectEmojiFromImage(
    env: Env,
    imageUrl: string,
): Promise<{labeled: EmojiLabel | null; meta: ImageMeta | null}> {
    const url = imageUrl.trim();
    if (!/^https?:\/\//iu.test(url)) return {labeled: null, meta: null};

    let prepared: {url: string; meta: ImageMeta};
    try {
        prepared = await prepareEmojiImage(url);
    } catch (error) {
        logger.warn('表情图没拉下来', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {labeled: null, meta: null};
    }

    try {
        const raw = await requestLlmJson(env, {
            type: 'chat',
            system: LLM_PROMPTS.emojiLabel,
            user: '给这张表情写检索字段。',
            imageUrl: prepared.url,
        });
        const labeled = raw ? normalizeLabel(raw) : null;
        return {
            labeled: labeled
                ? {
                    ...labeled,
                    size: prepared.meta.size,
                    width: prepared.meta.width,
                    height: prepared.meta.height,
                    mime: prepared.meta.mime,
                }
                : null,
            meta: prepared.meta,
        };
    } catch (error) {
        logger.warn('表情标签没写成', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {labeled: null, meta: prepared.meta};
    }
}

