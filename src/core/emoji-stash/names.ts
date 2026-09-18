import {EMOJI_STASH_CATEGORY_LABELS, type EmojiStashCategory} from './categories.js';
import {translateTags} from './tag-zh.js';

const HAS_CJK = /[\u4e00-\u9fff]/u;

export function normalizeChineseTags(tags: string[] | undefined): string[] {
    if (!tags?.length) return [];
    const out: string[] = [];
    for (const raw of tags) {
        const tag = String(raw).trim().replace(/[#[\]【】]/gu, '').slice(0, 12);
        if (!tag || !HAS_CJK.test(tag)) continue;
        if (!out.includes(tag)) out.push(tag);
        if (out.length >= 5) break;
    }
    return out;
}

/** 中文优先：英文标签翻过去，翻不了的丢掉。 */
export function normalizeTags(tags: string[] | undefined): string[] {
    return translateTags(tags);
}

export function slugifyToken(value: string, maxLength = 24): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')
        .slice(0, maxLength);
}

export function fallbackEmojiName(seed: string): string {
    const slug = slugifyToken(seed) || `emoji_${Date.now().toString(36)}`;
    return slug.startsWith('emoji_') ? slug : `emoji_${slug.slice(0, 12)}`;
}

export function fallbackEmojiTags(category: EmojiStashCategory): string[] {
    return [EMOJI_STASH_CATEGORY_LABELS[category]];
}

export function resolveUniqueEmojiName(
    desiredName: string,
    existingNames: string[],
    seed: string,
): string {
    const trimmed = desiredName.trim();
    const base = HAS_CJK.test(trimmed)
        ? trimmed.replace(/\s+/g, '').slice(0, 16)
        : slugifyToken(trimmed)
            || `emoji_${slugifyToken(seed).slice(0, 8) || Date.now().toString(36)}`;
    if (!existingNames.includes(base)) return base;
    let index = 2;
    while (existingNames.includes(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
}
