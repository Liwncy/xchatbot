import type {TextMessage} from '../../types.js';
import {
    deleteStoredEmoji,
    listEmojiStash,
    markEmojiStashPending,
    sendStoredEmojiByBracket,
} from './service.js';
import {extractEmojiBracketSendCommand} from './parse-send.js';

function isSaveCommand(content: string): boolean {
    return /^存表情(?:\s+.*)?$/u.test(content.trim());
}

function parseDeleteCommand(content: string): string | null {
    const matched = content.trim().match(/^删表情\s+(.+)$/u);
    return matched ? matched[1].trim().toLowerCase() : null;
}

function isListCommand(content: string): boolean {
    return content.trim() === '表情列表';
}

function buildUsageHint(): string {
    return [
        '用法：',
        '· 发表情自动收藏（可关闭）',
        '· 存表情（手动收藏，可引用表情）',
        '· 表情列表（聊天记录卡片）',
        '· [name] 或 哈哈哈哈[/funny] 发表情',
        '· [/funny] 随机分类',
        '· [#tag] 随机标签',
        '分类：funny meme cute react sad angry love animal work misc',
    ].join('\n');
}

export const emojiStashTriggerPlugin: TextMessage = {
    type: 'text',
    name: 'emoji-stash-trigger',
    description: 'AI 表情库：自动/手动收藏，[name][/分类][#标签] 发送',

    match: (content) => {
        const trimmed = content.trim();
        return (
            isSaveCommand(trimmed)
            || isListCommand(trimmed)
            || parseDeleteCommand(trimmed) !== null
            || extractEmojiBracketSendCommand(trimmed) !== null
        );
    },

    handle: async (message, env) => {
        const trimmed = (message.content ?? '').trim();

        if (isSaveCommand(trimmed)) {
            return markEmojiStashPending(message, env);
        }

        if (isListCommand(trimmed)) {
            return listEmojiStash(message, env);
        }

        const deleteName = parseDeleteCommand(trimmed);
        if (deleteName) {
            return deleteStoredEmoji(message, env, deleteName);
        }

        const bracketCommand = extractEmojiBracketSendCommand(trimmed);
        if (bracketCommand) {
            return sendStoredEmojiByBracket(message, env, bracketCommand);
        }

        return {
            type: 'text',
            content: buildUsageHint(),
        };
    },
};
