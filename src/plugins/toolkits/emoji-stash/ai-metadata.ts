import {logger} from '../../../utils/logger.js';
import {resolveAgnesTextConfig} from '../../cognitive/agnes-text/config.js';
import {requestAgnesTextCompletion} from '../../cognitive/agnes-text/client.js';
import type {Env} from '../../../types/env.js';
import {
    formatCategoryListForPrompt,
    normalizeEmojiStashCategory,
} from './categories.js';
import type {EmojiAiMetadata} from './types.js';

function buildEmojiMetadataSystemPrompt(): string {
    return [
        'You catalog WeChat sticker/GIF emojis for a personal library.',
        'Output ONLY one valid JSON object. No markdown, no code fence, no explanation.',
        `Categories (pick exactly one): ${formatCategoryListForPrompt()}`,
        'Fields:',
        '- name: English slug, 2-24 chars, lowercase letters/digits/underscore only, unique and descriptive',
        '- category: one category from the list above',
        '- tags: array of 2-5 English slugs (lowercase, a-z0-9 underscore), related keywords',
        'Example: {"name":"no_java_cat","category":"meme","tags":["programming","study","funny","cat"]}',
    ].join('\n');
}

function slugifyToken(value: string, maxLength = 24): string {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
    return slug.slice(0, maxLength);
}

function parseEmojiMetadataJson(raw: string): EmojiAiMetadata | null {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
        const parsed = JSON.parse(jsonMatch[0]) as {
            name?: string;
            category?: string;
            tags?: string[] | string;
        };
        const name = slugifyToken(parsed.name ?? '');
        if (!name || !/^[a-z][a-z0-9_]*$/u.test(name)) return null;

        const category = normalizeEmojiStashCategory(parsed.category ?? 'misc');
        const rawTags = Array.isArray(parsed.tags)
            ? parsed.tags
            : typeof parsed.tags === 'string'
                ? parsed.tags.split(/[,\s#]+/u)
                : [];
        const tags = rawTags
            .map((tag) => slugifyToken(String(tag), 20))
            .filter((tag) => tag.length >= 2)
            .slice(0, 5);

        if (tags.length === 0) {
            tags.push(category);
        }

        return {name, category, tags};
    } catch {
        return null;
    }
}

export async function requestEmojiAiMetadata(
    env: Env,
    imageUrl: string,
): Promise<EmojiAiMetadata | null> {
    const config = resolveAgnesTextConfig(env);
    if (!config) return null;

    const raw = await requestAgnesTextCompletion(config, {
        systemPrompt: buildEmojiMetadataSystemPrompt(),
        userText: 'Analyze this emoji/sticker image and return JSON metadata.',
        imageUrl,
        temperature: 0.2,
        maxTokens: 128,
    });
    if (!raw) return null;

    const metadata = parseEmojiMetadataJson(raw);
    logger.info('表情 AI 元数据', {raw, metadata});
    return metadata;
}

export function buildFallbackEmojiMetadata(md5: string): EmojiAiMetadata {
    return {
        name: `emoji_${md5.slice(0, 8)}`,
        category: 'misc',
        tags: ['misc'],
    };
}

export function resolveUniqueEmojiName(
    desiredName: string,
    existingNames: string[],
    md5: string,
): string {
    const base = slugifyToken(desiredName) || `emoji_${md5.slice(0, 8)}`;
    if (!existingNames.includes(base)) return base;

    let index = 2;
    while (existingNames.includes(`${base}_${index}`)) {
        index += 1;
    }
    return `${base}_${index}`;
}
