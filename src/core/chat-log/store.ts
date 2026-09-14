import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../message.js';
import type {ReplyMessage} from '../reply.js';
import {resolveBotId, resolveBotName} from '../bot.js';
import {logger} from '../../utils/logger.js';
import {resolveChatSession} from './session.js';
import type {
    ChatMessageRecord,
    GetRecentMessagesOptions,
    RecordOutboundOptions,
} from './types.js';

const MAX_CONTENT = 4000;

type ChatMessageRow = {
    id: number;
    message_id: string;
    platform: string;
    session_id: string;
    session_type: string;
    direction: string;
    actor_type: string;
    sender_id: string;
    sender_name: string;
    msg_type: string;
    content_text: string;
    payload_json: string;
    char_count: number;
    refer_message_id: string | null;
    caused_by_message_id: string | null;
    reply_index: number;
    plugin_name: string | null;
    reply_status: string | null;
    created_at: number;
    ingested_at: number;
};

let schemaReady: Promise<void> | null = null;

export function isChatLogEnabled(env: Env): boolean {
    const raw = env.CHAT_LOG_ENABLE;
    if (typeof raw !== 'string') return true;
    const normalized = raw.trim().toLowerCase();
    return !['0', 'false', 'no', 'off', '关', '关闭'].includes(normalized);
}

function clip(value: string): string {
    if (value.length <= MAX_CONTENT) return value;
    return `${value.slice(0, MAX_CONTENT)}...`;
}

function inboundContent(message: IncomingMessage): string {
    switch (message.type) {
        case 'image':
            return '[图片]';
        case 'emoji':
            return '[表情]';
        case 'voice':
            return '[语音]';
        case 'video':
            return '[视频]';
        case 'link':
            return clip(message.quote?.title?.trim() || message.content?.trim() || '[链接]');
        default:
            return clip(message.content?.trim() ?? '');
    }
}

function inboundPayload(message: IncomingMessage): string {
    const payload: Record<string, unknown> = {};
    if (message.quote) payload.quote = message.quote;
    return JSON.stringify(payload);
}

function outboundContent(reply: ReplyMessage): string {
    return clip(reply.content.trim());
}

function outboundPayload(reply: ReplyMessage, extra?: Record<string, unknown>): string {
    const payload: Record<string, unknown> = {...(extra ?? {})};
    if (reply.mentions?.length) payload.mentions = reply.mentions;
    return JSON.stringify(payload);
}

async function ensureSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS chat_message (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT NOT NULL,
                    platform TEXT NOT NULL DEFAULT 'wechat',
                    session_id TEXT NOT NULL,
                    session_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    actor_type TEXT NOT NULL,
                    sender_id TEXT NOT NULL,
                    sender_name TEXT NOT NULL DEFAULT '',
                    msg_type TEXT NOT NULL,
                    content_text TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    char_count INTEGER NOT NULL DEFAULT 0,
                    refer_message_id TEXT,
                    caused_by_message_id TEXT,
                    reply_index INTEGER NOT NULL DEFAULT 0,
                    plugin_name TEXT,
                    reply_status TEXT,
                    created_at INTEGER NOT NULL,
                    ingested_at INTEGER NOT NULL,
                    UNIQUE(platform, message_id)
                )`,
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_chat_message_session_id ON chat_message(session_id, id DESC)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_chat_message_session_time ON chat_message(session_id, created_at)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_chat_message_session_actor_time ON chat_message(session_id, actor_type, created_at)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_chat_message_caused_by ON chat_message(caused_by_message_id)',
            ).run();
        })();
    }
    await schemaReady;
}

function mapRow(row: ChatMessageRow): ChatMessageRecord {
    return {
        id: row.id,
        messageId: row.message_id,
        platform: row.platform,
        sessionId: row.session_id,
        sessionType: row.session_type === 'private' ? 'private' : 'group',
        direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
        actorType: row.actor_type === 'bot' ? 'bot' : row.actor_type === 'system' ? 'system' : 'member',
        senderId: row.sender_id,
        senderName: row.sender_name,
        msgType: row.msg_type,
        contentText: row.content_text,
        payloadJson: row.payload_json,
        charCount: row.char_count,
        referMessageId: row.refer_message_id,
        causedByMessageId: row.caused_by_message_id,
        replyIndex: row.reply_index,
        pluginName: row.plugin_name,
        replyStatus: row.reply_status === 'failed' ? 'failed' : row.reply_status === 'sent' ? 'sent' : null,
        createdAt: row.created_at,
        ingestedAt: row.ingested_at,
    };
}

async function insertInbound(db: D1Database, message: IncomingMessage): Promise<void> {
    const messageId = message.messageId.trim();
    if (!messageId) return;

    await ensureSchema(db);
    const session = resolveChatSession(message);
    const contentText = inboundContent(message);
    const now = Math.floor(Date.now() / 1000);
    const referId = message.quote?.referMessageId?.newIdText
        ?? (message.quote?.referMessageId?.newId != null
            ? String(message.quote.referMessageId.newId)
            : null);

    await db.prepare(
        `INSERT OR IGNORE INTO chat_message (
            message_id, platform, session_id, session_type,
            direction, actor_type, sender_id, sender_name,
            msg_type, content_text, payload_json, char_count,
            refer_message_id, caused_by_message_id, reply_index,
            plugin_name, reply_status, created_at, ingested_at
        ) VALUES (?1, ?2, ?3, ?4, 'inbound', 'member', ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, 0, NULL, NULL, ?12, ?13)`,
    ).bind(
        messageId,
        message.platform,
        session.sessionId,
        session.sessionType,
        message.from.trim() || 'unknown',
        message.senderName?.trim() ?? '',
        message.type,
        contentText,
        inboundPayload(message),
        [...contentText].length,
        referId,
        message.timestamp || now,
        now,
    ).run();
}

async function insertOutbound(
    db: D1Database,
    env: Env,
    message: IncomingMessage,
    reply: ReplyMessage,
    options: RecordOutboundOptions,
): Promise<void> {
    await ensureSchema(db);
    const session = resolveChatSession(message);
    const contentText = outboundContent(reply);
    const now = Math.floor(Date.now() / 1000);
    const outboundId = options.outboundMessageId?.trim() || `bot:${crypto.randomUUID()}`;

    await db.prepare(
        `INSERT INTO chat_message (
            message_id, platform, session_id, session_type,
            direction, actor_type, sender_id, sender_name,
            msg_type, content_text, payload_json, char_count,
            refer_message_id, caused_by_message_id, reply_index,
            plugin_name, reply_status, created_at, ingested_at
        ) VALUES (?1, ?2, ?3, ?4, 'outbound', 'bot', ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?12, NULL, ?13, ?14, ?15)`,
    ).bind(
        outboundId,
        message.platform,
        session.sessionId,
        session.sessionType,
        resolveBotId(env, message.platform) || 'bot',
        resolveBotName(env),
        reply.type,
        contentText,
        outboundPayload(reply, options.payload),
        [...contentText].length,
        options.causedByMessageId,
        options.replyIndex ?? 0,
        options.replyStatus ?? 'sent',
        now,
        now,
    ).run();
}

export async function recordInboundChatMessage(env: Env, message: IncomingMessage): Promise<void> {
    if (!isChatLogEnabled(env)) return;
    try {
        await insertInbound(env.XBOT_DB, message);
    } catch (error) {
        logger.warn('会话入站记录失败', {
            messageId: message.messageId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function recordOutboundChatMessage(
    env: Env,
    message: IncomingMessage,
    reply: ReplyMessage,
    options: RecordOutboundOptions,
): Promise<void> {
    if (!isChatLogEnabled(env)) return;
    try {
        await insertOutbound(env.XBOT_DB, env, message, reply, options);
    } catch (error) {
        logger.warn('会话出站记录失败', {
            messageId: message.messageId,
            replyType: reply.type,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function getRecentChatMessages(
    env: Env,
    sessionId: string,
    options: GetRecentMessagesOptions = {},
): Promise<ChatMessageRecord[]> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return [];
    await ensureSchema(env.XBOT_DB);

    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const exclude = options.excludeMessageId?.trim();
    const result = exclude
        ? await env.XBOT_DB.prepare(
            `SELECT * FROM chat_message
             WHERE session_id = ?1 AND message_id <> ?2
             ORDER BY id DESC LIMIT ?3`,
        ).bind(sessionId, exclude, limit).all<ChatMessageRow>()
        : await env.XBOT_DB.prepare(
            `SELECT * FROM chat_message
             WHERE session_id = ?1
             ORDER BY id DESC LIMIT ?2`,
        ).bind(sessionId, limit).all<ChatMessageRow>();

    return (result.results ?? []).map(mapRow).reverse();
}
