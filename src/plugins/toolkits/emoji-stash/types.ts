import type {EmojiStashCategory} from './categories.js';

/** 表情发表情结果；未设置视为 ok。 */
export type StoredEmojiStatus = 'ok' | 'failed';

/** KV 中保存的单条表情记录。 */
export interface StoredEmoji {
    /** 英文 slug，AI 生成。 */
    name: string;
    md5: string;
    cdnurl: string;
    category: EmojiStashCategory;
    tags: string[];
    size?: number;
    width?: number;
    height?: number;
    createdAt: number;
    source?: 'auto' | 'manual';
    /** 发表情状态：未设置=未发送，ok=成功，failed=失败。 */
    status?: StoredEmojiStatus;
}

/** 从 type 47 消息解析出的表情字段。 */
export interface ParsedInboundEmoji {
    md5: string;
    cdnurl: string;
    size?: number;
    width?: number;
    height?: number;
}

/** AI 生成的表情元数据。 */
export interface EmojiAiMetadata {
    name: string;
    category: EmojiStashCategory;
    tags: string[];
}

/** 等待下一条表情消息的 pending（手动存表情）。 */
export interface EmojiStashPending {
    ownerId: string;
    sessionKey: string;
    createdAt: number;
}
