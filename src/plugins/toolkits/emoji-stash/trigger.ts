import type {TextMessage} from '../../types.js';
import {
    deleteStoredEmoji,
    listEmojiStash,
    markEmojiStashPending,
    retryFailedEmojis,
    sendStoredEmojiByBracket,
    verifyUnsentEmojis,
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

function parseBatchCount(raw?: string): number | undefined {
    if (!raw?.trim()) return undefined;
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseVerifyCommand(content: string): {count?: number} | null {
    const matched = content.trim().match(/^验证表情(?:\s+(\d+))?$/u);
    if (!matched) return null;
    return {count: parseBatchCount(matched[1])};
}

function parseRetryCommand(content: string): {count?: number} | null {
    const matched = content.trim().match(/^重验表情(?:\s+(\d+))?$/u);
    if (!matched) return null;
    return {count: parseBatchCount(matched[1])};
}

function buildUsageHint(): string {
    return [
        '用法：',
        '· 发表情自动收藏（可关闭）',
        '· 存表情（手动收藏，可引用表情）',
        '· 表情列表（聊天记录卡片）',
        '· 验证表情（默认先验 5 个，可带数量）',
        '· 重验表情（默认先重验失败的 5 个，可带数量）',
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
            || parseVerifyCommand(trimmed) !== null
            || parseRetryCommand(trimmed) !== null
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

        const verifyCommand = parseVerifyCommand(trimmed);
        if (verifyCommand) {
            return verifyUnsentEmojis(message, env, verifyCommand.count);
        }

        const retryCommand = parseRetryCommand(trimmed);
        if (retryCommand) {
            return retryFailedEmojis(message, env, retryCommand.count);
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
