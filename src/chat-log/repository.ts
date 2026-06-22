import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import type {ReplyMessage} from '../types/reply.js';
import {resolveChatSession} from './session.js';
import {
    createOutboundMessageId,
    isChatLogEnabled,
    normalizeInboundMessage,
    normalizeOutboundReply,
} from './normalize.js';
import {mergeWechatRevokeIntoPayload, stripWechatRevokeFromPayload} from './revoke-meta.js';
import {getBotWechatId, getBotWechatName} from '../utils/bot.js';
import {getChatLogHandleMeta} from './context.js';
import type {
    ChatMessageRecord,
    GetRecentMessagesOptions,
    RecordInboundOptions,
    RecordOutboundOptions,
} from './types.js';

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

function mapRow(row: ChatMessageRow): ChatMessageRecord {
    return {
        id: row.id,
        messageId: row.message_id,
        platform: row.platform,
        sessionId: row.session_id,
        sessionType: row.session_type === 'private' ? 'private' : 'group',
        direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
        actorType: row.actor_type === 'bot'
            ? 'bot'
            : row.actor_type === 'system'
                ? 'system'
                : 'member',
        senderId: row.sender_id,
        senderName: row.sender_name,
        msgType: row.msg_type as ChatMessageRecord['msgType'],
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

export class ChatLogRepository {
    private static readonly CREATE_TABLE_SQL = "CREATE TABLE IF NOT EXISTS chat_message ("
        + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
        + 'message_id TEXT NOT NULL, '
        + "platform TEXT NOT NULL DEFAULT 'wechat', "
        + 'session_id TEXT NOT NULL, '
        + 'session_type TEXT NOT NULL, '
        + 'direction TEXT NOT NULL, '
        + 'actor_type TEXT NOT NULL, '
        + 'sender_id TEXT NOT NULL, '
        + "sender_name TEXT NOT NULL DEFAULT '', "
        + 'msg_type TEXT NOT NULL, '
        + "content_text TEXT NOT NULL DEFAULT '', "
        + "payload_json TEXT NOT NULL DEFAULT '{}', "
        + 'char_count INTEGER NOT NULL DEFAULT 0, '
        + 'refer_message_id TEXT, '
        + 'caused_by_message_id TEXT, '
        + 'reply_index INTEGER NOT NULL DEFAULT 0, '
        + 'plugin_name TEXT, '
        + 'reply_status TEXT, '
        + 'created_at INTEGER NOT NULL, '
        + 'ingested_at INTEGER NOT NULL, '
        + 'UNIQUE(platform, message_id)'
        + ')';

    private static readonly CREATE_INDEXES_SQL = [
        'CREATE INDEX IF NOT EXISTS idx_chat_message_session_id ON chat_message(session_id, id DESC)',
        'CREATE INDEX IF NOT EXISTS idx_chat_message_session_time ON chat_message(session_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_chat_message_session_actor_time ON chat_message(session_id, actor_type, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_chat_message_caused_by ON chat_message(caused_by_message_id)',
    ];

    static async ensureSchema(db: D1Database): Promise<void> {
        if (!schemaReady) {
            schemaReady = (async () => {
                await db.prepare(ChatLogRepository.CREATE_TABLE_SQL).run();
                for (const sql of ChatLogRepository.CREATE_INDEXES_SQL) {
                    await db.prepare(sql).run();
                }
            })();
        }
        await schemaReady;
    }

    static async recordInbound(
        db: D1Database,
        message: IncomingMessage,
        options: RecordInboundOptions = {},
    ): Promise<void> {
        const messageId = message.messageId.trim();
        if (!messageId) return;

        await ChatLogRepository.ensureSchema(db);

        const session = resolveChatSession(message);
        const normalized = normalizeInboundMessage(message);
        const now = Math.floor(Date.now() / 1000);
        const senderId = message.from.trim() || 'unknown';
        const senderName = message.senderName?.trim() ?? '';

        await db.prepare(
            `INSERT OR IGNORE INTO chat_message (
                message_id, platform, session_id, session_type,
                direction, actor_type, sender_id, sender_name,
                msg_type, content_text, payload_json, char_count,
                refer_message_id, caused_by_message_id, reply_index,
                plugin_name, reply_status, created_at, ingested_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, 0, NULL, NULL, ?14, ?15)`,
        ).bind(
            messageId,
            message.platform,
            session.sessionId,
            session.sessionType,
            'inbound',
            normalized.actorType,
            senderId,
            senderName,
            normalized.msgType,
            normalized.contentText,
            normalized.payloadJson,
            [...normalized.contentText].length,
            options.referMessageId?.trim() || null,
            message.timestamp || now,
            now,
        ).run();
    }

    static async recordOutbound(
        db: D1Database,
        message: IncomingMessage,
        reply: ReplyMessage,
        env: Env,
        options: RecordOutboundOptions,
    ): Promise<void> {
        await ChatLogRepository.ensureSchema(db);

        const session = resolveChatSession(message);
        const normalized = normalizeOutboundReply(reply);
        const payloadJson = mergeWechatRevokeIntoPayload(normalized.payloadJson, options.wechatRevoke);
        const now = Math.floor(Date.now() / 1000);
        const meta = getChatLogHandleMeta(message);
        const botSenderId = options.botSenderId?.trim() || getBotWechatId(env, message);
        const botSenderName = options.botSenderName?.trim() || getBotWechatName(env);

        await db.prepare(
            `INSERT INTO chat_message (
                message_id, platform, session_id, session_type,
                direction, actor_type, sender_id, sender_name,
                msg_type, content_text, payload_json, char_count,
                refer_message_id, caused_by_message_id, reply_index,
                plugin_name, reply_status, created_at, ingested_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13, ?14, ?15, ?16, ?17, ?18)`,
        ).bind(
            createOutboundMessageId(),
            message.platform,
            session.sessionId,
            session.sessionType,
            'outbound',
            'bot',
            botSenderId,
            botSenderName,
            normalized.msgType,
            normalized.contentText,
            payloadJson,
            [...normalized.contentText].length,
            options.causedByMessageId,
            options.replyIndex ?? 0,
            options.pluginName?.trim() || meta?.pluginName?.trim() || null,
            options.replyStatus ?? 'sent',
            now,
            now,
        ).run();
    }

    static async listRevokableOutbound(
        db: D1Database,
        sessionId: string,
        limit: number,
        options: {textOnly?: boolean} = {},
    ): Promise<ChatMessageRecord[]> {
        await ChatLogRepository.ensureSchema(db);

        const safeLimit = Math.max(1, Math.min(limit, 50));
        const textFilter = options.textOnly
            ? " AND msg_type IN ('text', 'markdown')"
            : '';
        const result = await db.prepare(
            `SELECT *
             FROM chat_message
             WHERE session_id = ?1
               AND direction = 'outbound'
               AND actor_type = 'bot'
               AND reply_status = 'sent'
               AND json_extract(payload_json, '$.wechat_revoke.new_id') IS NOT NULL${textFilter}
             ORDER BY id DESC
             LIMIT ?2`,
        ).bind(sessionId.trim(), safeLimit).all<ChatMessageRow>();

        return (result.results ?? []).map(mapRow);
    }

    static async findRevokableOutboundByNewId(
        db: D1Database,
        sessionId: string,
        newId: number,
    ): Promise<ChatMessageRecord | null> {
        await ChatLogRepository.ensureSchema(db);

        const result = await db.prepare(
            `SELECT *
             FROM chat_message
             WHERE session_id = ?1
               AND direction = 'outbound'
               AND actor_type = 'bot'
               AND reply_status = 'sent'
               AND json_extract(payload_json, '$.wechat_revoke.new_id') = ?2
             ORDER BY id DESC
             LIMIT 1`,
        ).bind(sessionId.trim(), newId).first<ChatMessageRow>();

        return result ? mapRow(result) : null;
    }

    static async clearWechatRevokeMeta(db: D1Database, messageId: string): Promise<void> {
        await ChatLogRepository.ensureSchema(db);

        const row = await db.prepare(
            'SELECT payload_json FROM chat_message WHERE message_id = ?1',
        ).bind(messageId.trim()).first<{payload_json: string}>();
        if (!row?.payload_json) return;

        const payloadJson = stripWechatRevokeFromPayload(row.payload_json);
        await db.prepare(
            'UPDATE chat_message SET payload_json = ?1 WHERE message_id = ?2',
        ).bind(payloadJson, messageId.trim()).run();
    }

    static async getRecentMessages(
        db: D1Database,
        sessionId: string,
        options: GetRecentMessagesOptions = {},
    ): Promise<ChatMessageRecord[]> {
        await ChatLogRepository.ensureSchema(db);

        const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
        const excludeMessageId = options.excludeMessageId?.trim();

        const result = excludeMessageId
            ? await db.prepare(
                `SELECT *
                 FROM chat_message
                 WHERE session_id = ?1 AND message_id <> ?2
                 ORDER BY id DESC
                 LIMIT ?3`,
            ).bind(sessionId, excludeMessageId, limit).all<ChatMessageRow>()
            : await db.prepare(
                `SELECT *
                 FROM chat_message
                 WHERE session_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2`,
            ).bind(sessionId, limit).all<ChatMessageRow>();

        const rows = (result.results ?? []).map(mapRow).reverse();
        if (!options.maxChars || options.maxChars <= 0) {
            return rows;
        }

        const selected: ChatMessageRecord[] = [];
        let charTotal = 0;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
            const row = rows[index];
            const nextTotal = charTotal + row.charCount;
            if (selected.length > 0 && nextTotal > options.maxChars) {
                break;
            }
            selected.unshift(row);
            charTotal = nextTotal;
        }
        return selected;
    }
}

export async function recordInboundChatMessage(env: Env, message: IncomingMessage): Promise<void> {
    if (!isChatLogEnabled(env)) return;
    try {
        await ChatLogRepository.recordInbound(env.XBOT_DB, message);
    } catch (error) {
        const {logger} = await import('../utils/logger.js');
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
        await ChatLogRepository.recordOutbound(env.XBOT_DB, message, reply, env, options);
    } catch (error) {
        const {logger} = await import('../utils/logger.js');
        logger.warn('会话出站记录失败', {
            messageId: message.messageId,
            replyType: reply.type,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
