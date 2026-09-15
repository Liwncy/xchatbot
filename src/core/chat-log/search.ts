import {logger} from '../../utils/logger.js';
import type {Env} from '../../types/env.js';
import {formatHistoryList} from './format-history.js';
import {resolveHistoryWindow, sanitizeHistoryLimit, sessionIdFromScope} from './query.js';
import {getChatMessagesById, queryChatMessages} from './store.js';

export type ChatHistoryArgs = {
    scope?: string;
    limit?: number;
    date?: string;
    from?: string;
    until?: string;
    hours?: number;
    speaker?: string;
    keyword?: string;
    msgType?: string;
    beforeId?: number;
    afterId?: number;
    direction?: string;
    platform?: string;
};

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function speakerFilter(speaker: string): {senderId?: string; senderName?: string} {
    if (!speaker) return {};
    const lower = speaker.toLowerCase();
    if (lower.startsWith('wxid_') || speaker.includes('@')) return {senderId: speaker};
    return {senderId: speaker, senderName: speaker};
}

export async function searchChatHistory(env: Env, args: ChatHistoryArgs): Promise<string> {
    const sessionId = sessionIdFromScope(asString(args.scope));
    if (!sessionId) {
        return '缺少 scope。请从本条消息前缀复制 scope= 后面那一段（group:… 或 user:…）。';
    }
    const resolved = resolveHistoryWindow({
        date: asString(args.date) || undefined,
        from: asString(args.from) || undefined,
        until: asString(args.until) || undefined,
        hours: args.hours,
    });
    if (resolved.error) return resolved.error;

    const windowed = resolved.window.sinceUnix != null || resolved.window.untilUnix != null;
    const limit = sanitizeHistoryLimit(args.limit, windowed);
    const who = speakerFilter(asString(args.speaker));
    const direction = asString(args.direction);
    const rows = await queryChatMessages(env, {
        sessionId,
        platform: asString(args.platform) || undefined,
        direction: direction === 'inbound' || direction === 'outbound' ? direction : undefined,
        sinceUnix: resolved.window.sinceUnix,
        untilUnix: resolved.window.untilUnix,
        senderId: who.senderId,
        senderName: who.senderName,
        keyword: asString(args.keyword) || undefined,
        msgType: asString(args.msgType) || undefined,
        beforeId: args.beforeId,
        afterId: args.afterId,
        limit,
    });
    logger.info('查聊天记录', {sessionId, limit, hits: rows.length});
    return formatHistoryList(rows, resolved.window.label, limit, windowed && args.beforeId == null);
}

export async function getChatHistoryByMessageId(env: Env, messageId: string): Promise<string> {
    const id = messageId.trim();
    if (!id) return '缺少 messageId。';
    const rows = await getChatMessagesById(env, id);
    logger.info('查单条聊天记录', {messageId: id, hits: rows.length});
    return rows.length === 0
        ? '没查到这条消息。'
        : formatHistoryList(rows, undefined, Number.MAX_SAFE_INTEGER, false);
}
