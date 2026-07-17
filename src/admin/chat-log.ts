import type { ChatActorType, ChatDirection, ChatMessageRecord } from '../chat-log/types.js';
import { ChatLogRepository } from '../chat-log/repository.js';
import type { Env } from '../types/env.js';
import { authorizeAdmin } from '../middleware/auth.js';

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

    return new Response('Not Found', { status: 404 });
}
