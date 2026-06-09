export const EMOJI_STASH_TITLE = '聪明表情';

/** 聪明表情聊天记录固定头像（与小聪明儿一致）。 */
export const EMOJI_STASH_AVATAR_URL =
    'https://wx.qlogo.cn/mmhead/ver_1/t4vmY8hTfx0rJnTygqKyIIX9PicUDwaEhib5Ex843gTJk7UVSKTcic4mlPt9rq2U7vMOJdXdHpdOSXoL0Ez8CicxWB3ojMh107wzggmTmKQn4bnxcL6lDVKx0mX91koST8x2/132';

export const EMOJI_STASH_SHARED_KV_KEY = 'emoji-stash:shared';
export const EMOJI_STASH_PENDING_KV_PREFIX = 'emoji-stash:pending:';
export const EMOJI_STASH_AUTO_COOLDOWN_KV_KEY = 'emoji-stash:auto-cooldown:global';

/** pending 等待用户发表情的 TTL（秒）。 */
export const EMOJI_STASH_PENDING_TTL_SECONDS = 5 * 60;

/** 英文 slug 名称最大长度。 */
export const EMOJI_STASH_NAME_MAX_LENGTH = 32;

/** 是否自动收藏用户发送的表情（无需指令）。 */
export const EMOJI_STASH_AUTO_COLLECT = true;

/** 自动收藏冷却时间（秒），全局共用，冷却期内不会再次自动收藏。 */
export const EMOJI_STASH_AUTO_COLLECT_COOLDOWN_SECONDS = 60;

export const EMOJI_STASH_SAVE_REPLY = '请发送要收藏的表情，或引用表情后发送「存表情」。';
export const EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY = '未能解析表情的 md5 或 cdnurl，无法保存。';
export const EMOJI_STASH_SAVE_OK_REPLY = (name: string, category: string, tags: string[]) =>
    `已收藏 [${name}] /${category} ${tags.map((t) => `#${t}`).join(' ')}`;
export const EMOJI_STASH_AUTO_OK_REPLY = '图很好，现在是我的啦[旺柴]';
export const EMOJI_STASH_NOT_FOUND_REPLY = (query: string) => `未找到表情：${query}`;
export const EMOJI_STASH_DELETE_OK_REPLY = (name: string) => `已删除表情 [${name}]。`;
export const EMOJI_STASH_LIST_EMPTY_REPLY =
    '📭 聪明表情还是空的～\n发表情会自动收藏，或发送「存表情」手动收藏。';
export const EMOJI_STASH_AI_FAIL_REPLY = 'AI 未能识别该表情，已使用默认名称保存。';
