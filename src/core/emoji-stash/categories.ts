export const EMOJI_STASH_CATEGORIES = [
    'funny',
    'meme',
    'cute',
    'react',
    'sad',
    'angry',
    'love',
    'animal',
    'work',
    'misc',
] as const;

export type EmojiStashCategory = (typeof EMOJI_STASH_CATEGORIES)[number];

export const EMOJI_STASH_CATEGORY_LABELS: Record<EmojiStashCategory, string> = {
    funny: '搞笑',
    meme: '梗图',
    cute: '可爱',
    react: '反应',
    sad: '难过',
    angry: '生气',
    love: '恋爱',
    animal: '动物',
    work: '打工',
    misc: '杂项',
};

const CATEGORY_SET = new Set<string>(EMOJI_STASH_CATEGORIES);

export function isEmojiStashCategory(value: string): value is EmojiStashCategory {
    return CATEGORY_SET.has(value);
}

export function normalizeEmojiStashCategory(value: string): EmojiStashCategory {
    const normalized = value.trim().toLowerCase();
    if (isEmojiStashCategory(normalized)) return normalized;
    return 'misc';
}

/** 认 english key 或中文标签。对不上返回 null，不要默默掉进杂项。 */
export function resolveEmojiStashCategoryToken(value: string): EmojiStashCategory | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (isEmojiStashCategory(lowered)) return lowered;
    for (const [key, label] of Object.entries(EMOJI_STASH_CATEGORY_LABELS)) {
        if (label === trimmed) return key as EmojiStashCategory;
    }
    return null;
}
