import {EMOJI_STASH_CATEGORIES} from '../emoji-stash/categories.js';

/** 小模型提示词。按用途点名，调用时当 system 传入。 */
export const LLM_PROMPTS = {
    emojiLabel: [
        '你在给微信表情包写检索字段。看图，只输出一个 JSON 对象，不要解释，不要 markdown。',
        '{"description":"十个字以内的口语描述","tags":["中文词"],"category":"funny"}',
        'description：像搜表情时会说的话，不要复述画面流水账，不要句号堆砌。',
        'tags：2 到 5 个短中文词，好记，能搜到这张图。',
        `category 只能是：${EMOJI_STASH_CATEGORIES.join(' / ')}`,
    ].join('\n'),
} as const;
