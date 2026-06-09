import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import type {WechatChatRecordItem} from '../../../wechat/builders/chat-record.js';
import {buildWechatChatRecordAppReply} from '../../../wechat/builders/chat-record.js';
import {
    EMOJI_STASH_AVATAR_URL,
    EMOJI_STASH_LIST_EMPTY_REPLY,
} from './constants.js';
import {
    EMOJI_STASH_CATEGORIES,
    formatEmojiStashCategoryBracket,
    getEmojiStashCategoryMeta,
    type EmojiStashCategory,
} from './categories.js';
import {listStoredEmojis} from './storage.js';
import type {StoredEmoji} from './types.js';

const EMOJI_STASH_LIST_RECORD_TITLE = '聪明表情收藏册';
const EMOJI_STASH_LIST_INTRO_NICKNAME = `🌟 ${EMOJI_STASH_LIST_RECORD_TITLE}`;

function buildIntroContent(total: number): string {
    return [
        `📦 共 ${total} 个表情`,
        '💡 发 [名称] 指定表情',
        '💡 发 [/分类] 随机分类',
        '💡 发 [#标签] 随机标签',
        '💡 对话里也可以：哈哈哈哈[/funny]',
    ].join('\n');
}

function formatCategoryRecordNickname(category: EmojiStashCategory, count: number): string {
    const meta = getEmojiStashCategoryMeta(category);
    return `${meta.emoji}${meta.label}·${count}`;
}

function formatEmojiListLine(index: number, item: StoredEmoji): string {
    const tags = item.tags.map((tag) => `#${tag}`).join(' ');
    const namePart = `[${item.name}]`;
    return tags ? `${index}. ${namePart} ${tags}` : `${index}. ${namePart}`;
}

function buildCategoryContent(category: EmojiStashCategory, bucket: StoredEmoji[]): string {
    const bracket = formatEmojiStashCategoryBracket(category);
    const lines = [
        `📤 随机发送：${bracket}`,
        '',
        ...bucket.map((item, index) => formatEmojiListLine(index + 1, item)),
    ];
    return lines.join('\n');
}

function buildCategorySummary(emojis: StoredEmoji[]): string {
    const counts = new Map<EmojiStashCategory, number>();
    for (const item of emojis) {
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }

    return EMOJI_STASH_CATEGORIES
        .filter((category) => counts.has(category))
        .map((category) => formatCategoryRecordNickname(category, counts.get(category) ?? 0))
        .join(' ');
}

function groupEmojisByCategory(emojis: StoredEmoji[]): Map<EmojiStashCategory, StoredEmoji[]> {
    const grouped = new Map<EmojiStashCategory, StoredEmoji[]>();
    for (const category of EMOJI_STASH_CATEGORIES) {
        grouped.set(category, []);
    }

    for (const item of emojis) {
        const bucket = grouped.get(item.category) ?? grouped.get('misc')!;
        bucket.push(item);
    }

    for (const bucket of grouped.values()) {
        bucket.sort((a, b) => a.name.localeCompare(b.name));
    }

    return grouped;
}

function buildListItems(emojis: StoredEmoji[], baseTimestampMs: number): WechatChatRecordItem[] {
    const items: WechatChatRecordItem[] = [];
    let offsetMs = 0;

    items.push({
        nickname: EMOJI_STASH_LIST_INTRO_NICKNAME,
        avatarUrl: EMOJI_STASH_AVATAR_URL,
        content: buildIntroContent(emojis.length),
        timestampMs: baseTimestampMs + offsetMs,
    });
    offsetMs += 1000;

    const grouped = groupEmojisByCategory(emojis);
    for (const category of EMOJI_STASH_CATEGORIES) {
        const bucket = grouped.get(category) ?? [];
        if (bucket.length === 0) continue;

        items.push({
            nickname: formatCategoryRecordNickname(category, bucket.length),
            avatarUrl: EMOJI_STASH_AVATAR_URL,
            content: buildCategoryContent(category, bucket),
            timestampMs: baseTimestampMs + offsetMs,
        });
        offsetMs += 1000;
    }

    return items;
}

export async function buildEmojiStashListReply(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const emojis = await listStoredEmojis(env);
    if (emojis.length === 0) {
        return {type: 'text', content: EMOJI_STASH_LIST_EMPTY_REPLY};
    }

    const baseTimestampMs = message.timestamp > 0 ? message.timestamp * 1000 : Date.now();
    const categorySummary = buildCategorySummary(emojis);

    return buildWechatChatRecordAppReply({
        title: EMOJI_STASH_LIST_RECORD_TITLE,
        summary: categorySummary || `${emojis.length} 个表情`,
        desc: `共 ${emojis.length} 个 · 发 [名] [/类] [#标] 或 哈哈哈哈[/funny]`,
        items: buildListItems(emojis, baseTimestampMs),
        isChatRoom: Boolean(message.room?.id),
    });
}
