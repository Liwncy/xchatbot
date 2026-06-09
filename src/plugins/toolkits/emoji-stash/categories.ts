/** 固定 10 类，供 AI 选择与 [/分类] 随机发送。 */
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

export type EmojiStashCategory = typeof EMOJI_STASH_CATEGORIES[number];

export interface EmojiStashCategoryMeta {
    label: string;
    emoji: string;
}

export const EMOJI_STASH_CATEGORY_META: Record<EmojiStashCategory, EmojiStashCategoryMeta> = {
    funny: {label: '搞笑', emoji: '😂'},
    meme: {label: '梗图', emoji: '🗿'},
    cute: {label: '可爱', emoji: '🥰'},
    react: {label: '反应', emoji: '👀'},
    sad: {label: '难过', emoji: '😢'},
    angry: {label: '生气', emoji: '😤'},
    love: {label: '恋爱', emoji: '💖'},
    animal: {label: '动物', emoji: '🐾'},
    work: {label: '打工', emoji: '💼'},
    misc: {label: '杂项', emoji: '🎲'},
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

export function formatCategoryListForPrompt(): string {
    return EMOJI_STASH_CATEGORIES.join(', ');
}

export function getEmojiStashCategoryMeta(category: EmojiStashCategory): EmojiStashCategoryMeta {
    return EMOJI_STASH_CATEGORY_META[category];
}

/** 聊天记录展示名，如「😂 搞笑」。 */
export function formatEmojiStashCategoryNickname(category: EmojiStashCategory): string {
    const meta = getEmojiStashCategoryMeta(category);
    return `${meta.emoji} ${meta.label}`;
}

/** 发送指令展示，如「[/funny]」。 */
export function formatEmojiStashCategoryBracket(category: EmojiStashCategory): string {
    return `[/${category}]`;
}
