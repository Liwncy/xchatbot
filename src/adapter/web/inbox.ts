import {queryChatMessages} from '../../core/chat-log/index.js';
import type {ChatMessageRecord} from '../../core/chat-log/types.js';
import type {Env} from '../../types/env.js';
import type {ReplyMessage} from '../../core/reply.js';

const MAX_ITEMS = 40;
const TTL_SECONDS = 60 * 60 * 24;

export interface WebInboxItem {
    seq: number;
    reply: ReplyMessage;
}

interface WebInbox {
    next: number;
    items: WebInboxItem[];
}

function inboxKey(userId: string): string {
    return `web:replies:${userId}`;
}

export function normalizeWebUserId(value: string | undefined): string | null {
    const userId = value?.trim() ?? '';
    if (!/^[\w-]{1,64}$/.test(userId)) return null;
    return userId;
}

function emptyInbox(): WebInbox {
    return {next: 1, items: []};
}

async function readInbox(env: Env, userId: string): Promise<WebInbox> {
    const raw = await env.XBOT_KV.get(inboxKey(userId));
    if (!raw) return emptyInbox();
    try {
        const parsed = JSON.parse(raw) as WebInbox;
        if (!parsed || !Array.isArray(parsed.items) || typeof parsed.next !== 'number') return emptyInbox();
        return parsed;
    } catch {
        return emptyInbox();
    }
}

export async function pushWebInbox(env: Env, userId: string, replies: ReplyMessage[]): Promise<void> {
    const safeUserId = normalizeWebUserId(userId);
    if (!safeUserId || !replies.length) return;
    userId = safeUserId;
    const inbox = await readInbox(env, userId);
    for (const reply of replies) {
        inbox.items.push({seq: inbox.next, reply});
        inbox.next += 1;
    }
    inbox.items = inbox.items.slice(-MAX_ITEMS);
    await env.XBOT_KV.put(inboxKey(userId), JSON.stringify(inbox), {expirationTtl: TTL_SECONDS});
}

function replyFromRow(row: ChatMessageRecord): ReplyMessage | null {
    let payload: Record<string, unknown> = {};
    try {
        payload = row.payloadJson ? JSON.parse(row.payloadJson) as Record<string, unknown> : {};
    } catch {
        payload = {};
    }
    const url = typeof payload.url === 'string' ? payload.url : '';
    const duration = typeof payload.duration === 'number' ? payload.duration : undefined;
    switch (row.msgType) {
        case 'image':
            return url ? {type: 'image', url} : null;
        case 'voice':
            return url ? {type: 'voice', url, duration, format: typeof payload.format === 'string' ? payload.format : undefined} : null;
        case 'video':
            return url ? {type: 'video', url, duration, thumbUrl: typeof payload.thumb_url === 'string' ? payload.thumb_url : undefined} : null;
        case 'link':
        case 'music':
            return url ? {
                type: row.msgType,
                title: typeof payload.title === 'string' ? payload.title : row.contentText,
                url,
                desc: typeof payload.desc === 'string' ? payload.desc : undefined,
                thumbUrl: typeof payload.thumb_url === 'string' ? payload.thumb_url : undefined,
            } : (row.contentText ? {type: 'text', content: row.contentText} : null);
        default:
            return row.contentText ? {type: 'text', content: row.contentText} : null;
    }
}

/** 出站先落在 D1。KV 收件箱是最终一致的，页面来不及读到。 */
export async function pullWebInbox(env: Env, userId: string, after: number): Promise<{latest: number; replies: WebInboxItem[]}> {
    const safeUserId = normalizeWebUserId(userId);
    if (!safeUserId) return {latest: 0, replies: []};
    const rows = await queryChatMessages(env, {
        sessionId: `private:${safeUserId}`,
        platform: 'web',
        direction: 'outbound',
        ...(after > 0 ? {afterId: after} : {}),
        limit: 20,
    });
    const replies = rows.flatMap((row) => {
        const reply = replyFromRow(row);
        return reply ? [{seq: row.id, reply}] : [];
    });
    if (!replies.length) return {latest: after > 0 ? after : 0, replies: []};
    return {latest: replies[replies.length - 1].seq, replies};
}
