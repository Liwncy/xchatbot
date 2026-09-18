import type {EmojiStashCategory} from './categories.js';

export const EMOJI_STATUSES = ['pending', 'active', 'disabled', 'broken'] as const;

export type EmojiStatus = (typeof EMOJI_STATUSES)[number];

export interface EmojiRecord {
    id: number;
    name: string;
    description: string;
    md5: string | null;
    imgUrl: string;
    mime: string | null;
    category: EmojiStashCategory;
    tags: string[];
    status: EmojiStatus;
    size: number | null;
    width: number | null;
    height: number | null;
    source: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface EmojiPublicItem {
    id: number;
    name: string;
    description: string;
    md5: string | null;
    imgUrl: string;
    mime: string | null;
    category: string;
    tags: string[];
    status: EmojiStatus;
}
