import {getAdapter} from '../../../adapter/index.js';
import type {IncomingMessage, MessageSource} from '../../../core/message.js';
import {parseRepliesFromText} from '../../../core/outbound.js';
import type {ReplyMessage} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Env} from '../../../types/env.js';
import {authorizeOpenClawRequest} from './auth.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseSource(raw: unknown, roomId: string): MessageSource {
    const value = asString(raw).toLowerCase();
    if (value === 'group' || roomId) return 'group';
    if (value === 'official') return 'official';
    return 'private';
}

function parseReplies(raw: unknown): ReplyMessage[] {
    if (!Array.isArray(raw)) return [];
    const replies: ReplyMessage[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        const type = asString(row.type).toLowerCase();
        if (type === 'text') {
            const content = asString(row.content || row.text);
            if (content) replies.push(...parseRepliesFromText(content));
            continue;
        }
        if (type === 'image') {
            const url = asString(row.url || row.mediaUrl);
            if (url) replies.push({type: 'image', url});
            continue;
        }
        if (type === 'voice' || type === 'audio') {
            const url = asString(row.url || row.mediaUrl);
            if (url) {
                replies.push({
                    type: 'voice',
                    url,
                    duration: typeof row.duration === 'number' ? row.duration : undefined,
                    format: asString(row.format) || undefined,
                });
            }
            continue;
        }
        if (type === 'video') {
            const url = asString(row.url || row.mediaUrl);
            if (url) {
                replies.push({
                    type: 'video',
                    url,
                    thumbUrl: asString(row.thumbUrl) || undefined,
                    duration: typeof row.duration === 'number' ? row.duration : undefined,
                });
            }
            continue;
        }
        if (type === 'link' || type === 'news') {
            const url = asString(row.url);
            if (url) {
                replies.push({
                    type: 'link',
                    url,
                    title: asString(row.title) || '链接',
                    desc: asString(row.desc || row.description) || undefined,
                    thumbUrl: asString(row.thumbUrl || row.picUrl) || undefined,
                });
            }
        }
    }
    return replies;
}

function buildInboundStub(body: Record<string, unknown>): IncomingMessage {
    const platform = asString(body.platform);
    const from = asString(body.from || body.userId);
    const roomId = asString(body.roomId || body.groupId);
    const source = parseSource(body.source, roomId);
    if (!platform) throw new Error('platform is required');
    if (!from) throw new Error('from is required');
    if (source === 'group' && !roomId) throw new Error('roomId is required for group');

    return {
        platform,
        type: 'text',
        source,
        from,
        senderName: asString(body.senderName) || undefined,
        to: from,
        timestamp: Date.now(),
        messageId: asString(body.messageId) || `openclaw:${crypto.randomUUID()}`,
        room: roomId ? {id: roomId} : undefined,
        raw: body,
    };
}

export async function handleOpenclawOutbound(
    request: Request,
    env: Env,
): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }
    if (!authorizeOpenClawRequest(request, env)) {
        return json({ok: false, error: 'unauthorized'}, 401);
    }

    let body: Record<string, unknown>;
    try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return json({ok: false, error: 'invalid json'}, 400);
        }
        body = parsed as Record<string, unknown>;
    } catch {
        return json({ok: false, error: 'invalid json'}, 400);
    }

    let message: IncomingMessage;
    try {
        message = buildInboundStub(body);
    } catch (error) {
        return json({ok: false, error: error instanceof Error ? error.message : String(error)}, 400);
    }

    const replies = parseReplies(body.replies);
    if (replies.length === 0) {
        return json({ok: false, error: 'replies is required'}, 400);
    }

    const adapter = getAdapter(message.platform);
    if (!adapter) {
        return json({ok: false, error: `unknown platform: ${message.platform}`}, 400);
    }

    try {
        const receipts = await adapter.send(message, replies, env);
        const sentCount = receipts.filter((item) => item.ok).length;
        if (sentCount === 0) {
            return json({ok: false, error: 'send failed', sentCount}, 502);
        }
        return json({ok: true, sentCount});
    } catch (error) {
        logger.warn('OpenClaw 出站失败', {
            platform: message.platform,
            error: error instanceof Error ? error.message : String(error),
        });
        return json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }, 502);
    }
}
