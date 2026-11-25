import type {Env} from '../../types/env.js';
import {ensureSchema as ensureChatLogSchema, isChatLogEnabled} from '../chat-log/store.js';

export interface CardRow {
    messageId: string;
    senderId: string;
    senderName: string;
    actorType: string;
    msgType: string;
    text: string;
    createdAt: number;
    referMessageId: string;
    mentionIds: string[];
    mentionNames: Map<string, string>;
}

export class CardQueryUnsafe extends Error {
    constructor(detail: string) {
        super(detail);
        this.name = 'CardQueryUnsafe';
    }
}

/** 最多取这么多行。画像只看群里最近的发言，不是他的全部发言。 */
export const CARD_ROW_LIMIT = 800;

function parseMentions(raw: string | null): {ids: string[]; names: Map<string, string>} {
    const names = new Map<string, string>();
    if (!raw) return {ids: [], names};
    try {
        const list = JSON.parse(raw) as unknown;
        if (!Array.isArray(list)) return {ids: [], names};
        const ids: string[] = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const id = String((item as {id?: unknown}).id ?? '').trim();
            if (!id) continue;
            ids.push(id);
            const name = String((item as {name?: unknown}).name ?? '').trim();
            if (name) names.set(id, name);
        }
        return {ids, names};
    } catch {
        return {ids: [], names};
    }
}

/**
 * 读一个群最近的发言，按时间从旧到新。
 * 只走 (session_id, created_at) 索引；计划里出现全表扫描或没用上这个索引就不查。
 */
export async function loadCardMaterial(
    env: Env,
    sessionId: string,
    sinceUnix: number,
): Promise<CardRow[]> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return [];
    await ensureChatLogSchema(env.XBOT_DB);
    const sql = `SELECT message_id, sender_id, sender_name, actor_type, msg_type, content_text, created_at,
                        refer_message_id, json_extract(payload_json, '$.mentions') AS mentions_json
         FROM chat_message
         WHERE session_id = ?1 AND created_at >= ?2
         ORDER BY created_at DESC
         LIMIT ${CARD_ROW_LIMIT}`;
    const plan = await env.XBOT_DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(sessionId, sinceUnix).all<Record<string, unknown>>();
    const detail = (plan.results ?? []).map((row) => String(row.detail ?? '')).join('\n');
    if (/SCAN chat_message/iu.test(detail) || !/idx_chat_message_session_time/iu.test(detail)) {
        throw new CardQueryUnsafe(detail || '没有查询计划');
    }
    const result = await env.XBOT_DB.prepare(sql).bind(sessionId, sinceUnix).all<{
        message_id: string;
        sender_id: string;
        sender_name: string;
        actor_type: string;
        msg_type: string;
        content_text: string;
        created_at: number;
        refer_message_id: string | null;
        mentions_json: string | null;
    }>();
    return (result.results ?? []).map((row) => {
        const mentions = parseMentions(row.mentions_json);
        return {
            messageId: row.message_id,
            senderId: row.sender_id.trim(),
            senderName: row.sender_name.trim(),
            actorType: row.actor_type,
            msgType: row.msg_type,
            text: row.content_text,
            createdAt: row.created_at,
            referMessageId: row.refer_message_id?.trim() ?? '',
            mentionIds: mentions.ids,
            mentionNames: mentions.names,
        };
    }).reverse();
}
