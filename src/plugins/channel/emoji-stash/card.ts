import {EMOJI_STASH_CATEGORIES, EMOJI_STASH_CATEGORY_LABELS} from '../../../core/emoji-stash/categories.js';
import type {EmojiRecord} from '../../../core/emoji-stash/types.js';
import {chatRecordReply, textReply, type HandlerResponse} from '../../../core/reply.js';

const AVATAR =
    'https://wx.qlogo.cn/mmhead/ver_1/t4vmY8hTfx0rJnTygqKyIIX9PicUDwaEhib5Ex843gTJk7UVSKTcic4mlPt9rq2U7vMOJdXdHpdOSXoL0Ez8CicxWB3ojMh107wzggmTmKQn4bnxcL6lDVKx0mX91koST8x2/132';

const MARKS: Record<string, string> = {
    funny: '😂',
    meme: '🃏',
    cute: '🥰',
    react: '😮',
    sad: '😢',
    angry: '😡',
    love: '💕',
    animal: '🐱',
    work: '💼',
    misc: '📦',
};

function lineOf(item: EmojiRecord, index: number): string {
    const tags = item.tags.filter((tag) => tag !== '表情').map((tag) => `#${tag}`).join(' ');
    const mark = item.status === 'disabled' ? '🚫' : '✅';
    return tags ? `${index}. ${mark} [${item.name}] ${tags}` : `${index}. ${mark} [${item.name}]`;
}

export function buildEmojiListCard(
    items: EmojiRecord[],
    botName: string,
    timestampMs: number,
): HandlerResponse {
    const active = items.filter((item) => item.status === 'active');
    const banned = items.filter((item) => item.status === 'disabled');
    if (!active.length && !banned.length) {
        return textReply('库还是空的，群里丢表情会自己收');
    }

    const nickname = botName.trim() || '小聪明儿';
    const cardItems = [
        {
            nickname: `🌟 ${nickname}表情`,
            avatarUrl: AVATAR,
            content: [
                `一共 ${active.length} 张能发${banned.length ? `，禁了 ${banned.length} 张` : ''}`,
                '发 [名字] 指定一张',
                '发 [/搞笑] 或 [/funny] 随机一类',
                '发 [#无奈] 随机标签',
                '夹在话里也行：哈哈哈哈[/funny]',
                '看册 #表情列表，拿掉 #禁表情 名字',
            ].join('\n'),
            timestampMs,
        },
    ];

    let offset = 1000;
    for (const category of EMOJI_STASH_CATEGORIES) {
        const bucket = active.filter((item) => item.category === category);
        if (!bucket.length) continue;
        cardItems.push({
            nickname: `${MARKS[category] ?? '📦'}${EMOJI_STASH_CATEGORY_LABELS[category]}·${bucket.length}`,
            avatarUrl: AVATAR,
            content: [`随机：[/${category}]`, '', ...bucket.map((item, index) => lineOf(item, index + 1))].join('\n'),
            timestampMs: timestampMs + offset,
        });
        offset += 1000;
    }

    if (banned.length) {
        cardItems.push({
            nickname: `🚫已禁·${banned.length}`,
            avatarUrl: AVATAR,
            content: banned.map((item, index) => lineOf(item, index + 1)).join('\n'),
            timestampMs: timestampMs + offset,
        });
    }

    return chatRecordReply(cardItems, {
        title: `${nickname}表情`,
        summary: active.map((item) => EMOJI_STASH_CATEGORY_LABELS[item.category]).filter((label, index, list) => list.indexOf(label) === index).join(' ')
            || `${active.length} 张`,
        desc: `共 ${active.length} 张 · [名字] [/类] [#标]`,
    });
}
