import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import type {ReplyMessage} from '../types/reply.js';
import {authorizeAdmin} from '../middleware/auth.js';
import {WechatApi} from '../wechat/api/index.js';
import {sendWechatReply} from '../wechat/outbound/send-reply.js';
import {recordOutboundChatMessage} from '../chat-log/repository.js';

type XbotOutboundBody = {
    source?: unknown;
    from?: unknown;
    to?: unknown;
    roomId?: unknown;
    causedByMessageId?: unknown;
    timestamp?: unknown;
    pluginName?: unknown;
    botSenderId?: unknown;
    botSenderName?: unknown;
    replies?: unknown;
};

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseOptionalTimestamp(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    if (/^\d+$/u.test(raw)) {
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

function resolveVoiceConversionOptions(env: Env): {voiceConvertApiUrl?: string} {
    const voiceEnv = env as Env & {
        VOICE_CONVERT_API_URL?: string;
        VOICE_TOSILK_API_URL?: string;
    };
    return {
        voiceConvertApiUrl: voiceEnv.VOICE_CONVERT_API_URL || voiceEnv.VOICE_TOSILK_API_URL,
    };
}

function parseReply(entry: unknown): ReplyMessage | null {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
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

function parseReplies(value: unknown): ReplyMessage[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => parseReply(entry))
        .filter((entry): entry is ReplyMessage => Boolean(entry));
}

function buildSyntheticMessage(body: XbotOutboundBody, env: Env): IncomingMessage | null {
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
        raw: {xbotOutbound: true},
    };
}

async function readBody(request: Request): Promise<XbotOutboundBody> {
    try {
        const body = await request.json() as unknown;
        if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
        return body as XbotOutboundBody;
    } catch {
        return {};
    }
}

export async function handleAdminXbotOutbound(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        return new Response(JSON.stringify({ok: false, error: 'WECHAT_API_BASE_URL 未配置'}, null, 2), {
            status: 500,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const body = await readBody(request);
    const message = buildSyntheticMessage(body, env);
    const replies = parseReplies(body.replies);
    if (!message || replies.length === 0) {
        return new Response(JSON.stringify({
            ok: false,
            error: '缺少有效的 causedByMessageId/source/from/roomId 或 replies',
        }, null, 2), {
            status: 400,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const api = new WechatApi(apiBaseUrl);
    const voiceOptions = resolveVoiceConversionOptions(env);
    const results: Array<{replyIndex: number; sent: boolean; error?: string}> = [];

    for (const [replyIndex, reply] of replies.entries()) {
        try {
            const receiver = message.room?.id ?? message.from;
            const sentRecord = await sendWechatReply(api, reply, receiver, voiceOptions);
            await recordOutboundChatMessage(env, message, reply, {
                causedByMessageId: message.messageId,
                replyIndex,
                pluginName: asString(body.pluginName) || 'openclaw-xbot',
                replyStatus: 'sent',
                botSenderId: asString(body.botSenderId) || undefined,
                botSenderName: asString(body.botSenderName) || undefined,
                wechatRevoke: sentRecord ?? undefined,
            });
            results.push({replyIndex, sent: true});
        } catch (error) {
            await recordOutboundChatMessage(env, message, reply, {
                causedByMessageId: message.messageId,
                replyIndex,
                pluginName: asString(body.pluginName) || 'openclaw-xbot',
                replyStatus: 'failed',
                botSenderId: asString(body.botSenderId) || undefined,
                botSenderName: asString(body.botSenderName) || undefined,
            });
            results.push({
                replyIndex,
                sent: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return new Response(JSON.stringify({
        ok: true,
        sentCount: results.filter((item) => item.sent).length,
        failedCount: results.filter((item) => !item.sent).length,
        results,
    }, null, 2), {
        headers: {'Content-Type': 'application/json'},
    });
}
