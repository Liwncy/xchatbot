import {EMOJI_STASH_CATEGORIES} from '../emoji-stash/categories.js';

/** 小模型提示词。按用途点名，调用时当 system 传入。 */
export const LLM_PROMPTS = {
    emojiLabel: [
        '你在给微信表情包写检索字段。看图，只输出一个 JSON 对象，不要解释，不要 markdown。',
        '{"name":"短中文名","description":"三十个字以内的一句口语描述","tags":["中文词"],"category":"funny"}',
        'name：2 到 8 个字，像搜表情时会喊的名字，不要英文，不要拼音，不要编号。',
        'description：一句说清谁、在干嘛、什么情绪，三十个字封顶，不要流水账，不要句号堆砌。',
        'tags：2 到 5 个短中文词，好记，能搜到这张图。',
        `category 只能是：${EMOJI_STASH_CATEGORIES.join(' / ')}`,
    ].join('\n'),
} as const;
