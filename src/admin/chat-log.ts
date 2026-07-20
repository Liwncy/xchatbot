import type { ChatActorType, ChatDirection, ChatMessageRecord, ChatReplyStatus } from '../chat-log/types.js';
import { ChatLogRepository, recordOutboundChatMessage } from '../chat-log/repository.js';
import type { Env } from '../types/env.js';
import type { IncomingMessage } from '../types/message.js';
import type { ReplyMessage } from '../types/reply.js';
import { authorizeAdmin } from '../middleware/auth.js';
import type { RevokeParam } from '../wechat/api/types.js';

type ChatLogQueryBody = {
    roomId?: unknown;
    sessionId?: unknown;
    limit?: unknown;
    maxChars?: unknown;
    direction?: unknown;
    actorType?: unknown;
    textOnly?: unknown;
    since?: unknown;
    until?: unknown;
};

type ChatLogOutboundBody = {
    source?: unknown;
    from?: unknown;
    to?: unknown;
    roomId?: unknown;
    causedByMessageId?: unknown;
    timestamp?: unknown;
    replyIndex?: unknown;
    pluginName?: unknown;
    replyStatus?: unknown;
    botSenderId?: unknown;
    botSenderName?: unknown;
    reply?: unknown;
    wechatRevoke?: unknown;
};

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function asBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function parseOptionalTimestamp(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    if (/^\d+$/.test(raw)) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 0) {
            return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
        }
        return undefined;
    }
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed / 1000);
}

function parseDirection(value: unknown): ChatDirection | undefined {
    const raw = asString(value).toLowerCase();
    if (raw === 'inbound' || raw === 'outbound') return raw;
    return undefined;
}

function parseActorType(value: unknown): ChatActorType | undefined {
    const raw = asString(value).toLowerCase();
    if (raw === 'member' || raw === 'bot' || raw === 'system') return raw;
    return undefined;
}

function buildMessageView(record: ChatMessageRecord) {
    return {
        id: record.id,
        messageId: record.messageId,
        createdAt: record.createdAt,
        createdAtIso: new Date(record.createdAt * 1000).toISOString(),
        direction: record.direction,
        actorType: record.actorType,
        senderId: record.senderId,
        senderName: record.senderName,
        msgType: record.msgType,
        contentText: record.contentText,
        pluginName: record.pluginName,
        replyStatus: record.replyStatus,
    };
}

function buildStats(messages: ChatMessageRecord[]) {
    const directionCounts: Record<string, number> = {};
    const actorCounts: Record<string, number> = {};
    const senderMap = new Map<string, { senderId: string; senderName: string; count: number }>();
    let charTotal = 0;

    for (const message of messages) {
        directionCounts[message.direction] = (directionCounts[message.direction] ?? 0) + 1;
        actorCounts[message.actorType] = (actorCounts[message.actorType] ?? 0) + 1;
        charTotal += message.charCount;

        const key = `${message.senderId}::${message.senderName}`;
        const existing = senderMap.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            senderMap.set(key, {
                senderId: message.senderId,
                senderName: message.senderName,
                count: 1,
            });
        }
    }

    const startedAt = messages[0]?.createdAt ?? null;
    const endedAt = messages[messages.length - 1]?.createdAt ?? null;
    const topSenders = [...senderMap.values()]
        .sort((a, b) => b.count - a.count || a.senderId.localeCompare(b.senderId))
        .slice(0, 10);

    return {
        messageCount: messages.length,
        charCount: charTotal,
        startedAt,
        startedAtIso: startedAt ? new Date(startedAt * 1000).toISOString() : null,
        endedAt,
        endedAtIso: endedAt ? new Date(endedAt * 1000).toISOString() : null,
        directionCounts,
        actorCounts,
        topSenders,
    };
}

async function readQueryBody(request: Request): Promise<ChatLogQueryBody> {
    try {
        const body = await request.json() as unknown;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {};
        }
        return body as ChatLogQueryBody;
    } catch {
        return {};
    }
}

async function readOutboundBody(request: Request): Promise<ChatLogOutboundBody> {
    try {
        const body = await request.json() as unknown;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {};
        }
        return body as ChatLogOutboundBody;
    } catch {
        return {};
    }
}

function parseReplyStatus(value: unknown): ChatReplyStatus | undefined {
    const raw = asString(value).toLowerCase();
    if (raw === 'sent' || raw === 'failed') return raw;
    return undefined;
}

function parseRevokeParam(value: unknown): RevokeParam | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const receiver = asString(record.receiver);
    const newId = asString(record.new_id || record.newId);
    const clientId = asString(record.client_id || record.clientId);
    const createTime = parseOptionalTimestamp(record.create_time ?? record.createTime);
    if (!receiver || !newId) return undefined;
    return {
        receiver,
        new_id: /^\d+$/.test(newId) ? newId : newId,
        ...(clientId ? {client_id: /^\d+$/.test(clientId) ? clientId : clientId} : {}),
        ...(createTime ? {create_time: createTime} : {}),
    };
}

function parseReply(body: unknown): ReplyMessage | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    const type = asString(record.type).toLowerCase();
    switch (type) {
        case 'text': {
            const content = asString(record.content);
            return content ? {type: 'text', content} : null;
        }
        case 'image': {
            const mediaId = asString(record.mediaId) || asString(record.originalUrl);
            const originalUrl = asString(record.originalUrl);
            return mediaId ? {
                type: 'image',
                mediaId,
                ...(originalUrl ? {originalUrl} : {}),
            } : null;
        }
        case 'voice': {
            const mediaId = asString(record.mediaId) || asString(record.originalUrl);
            if (!mediaId) return null;
            const duration = typeof record.duration === 'number' ? record.duration : Number(record.duration);
            const format = typeof record.format === 'number' ? record.format : Number(record.format);
            const originalUrl = asString(record.originalUrl);
            const fallbackText = asString(record.fallbackText);
            return {
                type: 'voice',
                mediaId,
                ...(Number.isFinite(duration) ? {duration} : {}),
                ...(Number.isFinite(format) ? {format} : {}),
                ...(originalUrl ? {originalUrl} : {}),
                ...(fallbackText ? {fallbackText} : {}),
            };
        }
        case 'video': {
            const mediaId = asString(record.mediaId) || asString(record.originalUrl);
            if (!mediaId) return null;
            const duration = typeof record.duration === 'number' ? record.duration : Number(record.duration);
            const title = asString(record.title);
            const description = asString(record.description);
            const originalUrl = asString(record.originalUrl);
            return {
                type: 'video',
                mediaId,
                ...(title ? {title} : {}),
                ...(description ? {description} : {}),
                ...(Number.isFinite(duration) ? {duration} : {}),
                ...(originalUrl ? {originalUrl} : {}),
            };
        }
        case 'markdown': {
            const content = asString(record.content);
            const title = asString(record.title);
            return content ? {
                type: 'markdown',
                content,
                ...(title ? {title} : {}),
            } : null;
        }
        case 'emoji': {
            const md5 = asString(record.md5);
            const emojiUrl = asString(record.emojiUrl);
            return md5 && emojiUrl ? {type: 'emoji', md5, emojiUrl} : null;
        }
        default:
            return null;
    }
}

function buildSyntheticMessage(body: ChatLogOutboundBody, env: Env): IncomingMessage | null {
    const source = asString(body.source).toLowerCase() === 'group' ? 'group' : 'private';
    const from = asString(body.from) || (source === 'private' ? asString(body.to) : '');
    const roomId = asString(body.roomId);
    const causedByMessageId = asString(body.causedByMessageId);
    if (!causedByMessageId) return null;
    if (source === 'group' && !roomId) return null;
    if (!from) return null;
    return {
        platform: 'wechat',
        type: 'text',
        source,
        from,
        to: asString(body.to) || env.BOT_WECHAT_ID?.trim() || 'bot',
        timestamp: parseOptionalTimestamp(body.timestamp) ?? Math.floor(Date.now() / 1000),
        messageId: causedByMessageId,
        content: '',
        ...(source === 'group' ? {room: {id: roomId}} : {}),
        raw: {externalChatLogRecord: true},
    };
}

export async function handleAdminChatLog(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === '/admin/chat-log') {
        return new Response(JSON.stringify({
            ok: true,
            tips: 'POST /admin/chat-log/query，body 可传 roomId/sessionId、limit、maxChars、direction、actorType、textOnly、since、until',
            examples: [
                { roomId: '123456@chatroom', limit: 30, textOnly: true },
                { roomId: '123456@chatroom', since: '2026-07-14T00:00:00+08:00', until: '2026-07-17T23:59:59+08:00' },
            ],
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (request.method === 'POST' && pathname === '/admin/chat-log/query') {
        const body = await readQueryBody(request);
        const sessionId = asString(body.sessionId) || asString(body.roomId);
        if (!sessionId) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'roomId 或 sessionId 不能为空',
            }, null, 2), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const limit = asBoundedNumber(body.limit, 40, 1, 200);
        const maxChars = asBoundedNumber(body.maxChars, 6000, 200, 20000);
        const direction = parseDirection(body.direction);
        const actorType = parseActorType(body.actorType);
        const textOnly = asBoolean(body.textOnly, true);
        const since = parseOptionalTimestamp(body.since);
        const until = parseOptionalTimestamp(body.until);

        const messages = await ChatLogRepository.queryMessages(env.XBOT_DB, {
            sessionId,
            limit,
            maxChars,
            direction,
            actorType,
            textOnly,
            since,
            until,
        });

        return new Response(JSON.stringify({
            ok: true,
            sessionId,
            sessionType: sessionId.endsWith('@chatroom') ? 'group' : 'private',
            filters: {
                limit,
                maxChars,
                direction: direction ?? 'all',
                actorType: actorType ?? 'all',
                textOnly,
                since: since ?? null,
                sinceIso: since ? new Date(since * 1000).toISOString() : null,
                until: until ?? null,
                untilIso: until ? new Date(until * 1000).toISOString() : null,
            },
            stats: buildStats(messages),
            messages: messages.map(buildMessageView),
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (request.method === 'POST' && pathname === '/admin/chat-log/outbound') {
        const body = await readOutboundBody(request);
        const message = buildSyntheticMessage(body, env);
        const reply = parseReply(body.reply);
        if (!message || !reply) {
            return new Response(JSON.stringify({
                ok: false,
                error: '缺少有效的 causedByMessageId/source/from/roomId 或 reply',
            }, null, 2), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        await recordOutboundChatMessage(env, message, reply, {
            causedByMessageId: message.messageId,
            replyIndex: asBoundedNumber(body.replyIndex, 0, 0, 999),
            pluginName: asString(body.pluginName) || 'openclaw-xbot',
            replyStatus: parseReplyStatus(body.replyStatus) ?? 'sent',
            botSenderId: asString(body.botSenderId) || undefined,
            botSenderName: asString(body.botSenderName) || undefined,
            wechatRevoke: parseRevokeParam(body.wechatRevoke),
        });

        return new Response(JSON.stringify({ok: true}, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response('Not Found', { status: 404 });
}
