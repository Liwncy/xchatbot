import type {Env} from '../../types/env.js';
import {ensureSchema as ensureChatLogSchema, isChatLogEnabled} from '../chat-log/store.js';
import type {MemoryItem} from './card.js';

export interface MemoryCardRow {
    subject: string;
    rev: string;
    items: MemoryItem[];
    promptText: string;
    updatedAt: number;
}

export interface MemoryMaterialRow {
    senderId: string;
    senderName: string;
    actorType: string;
    msgType: string;
    contentText: string;
    createdAt: number;
}

export interface DueSession {
    sessionId: string;
    sessionType: string;
    platform: string;
}

export class MemoryQueryUnsafe extends Error {
    constructor(detail: string) {
        super(detail);
        this.name = 'MemoryQueryUnsafe';
    }
}

let schemaReady: Promise<void> | null = null;

async function ensureSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            // chat_session 和它的索引跟着聊天记录那边建，这里只管记忆卡自己的表
            await ensureChatLogSchema(db);
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS chat_memory (
                    session_id TEXT NOT NULL,
                    subject TEXT NOT NULL DEFAULT '',
                    rev TEXT NOT NULL,
                    items_json TEXT NOT NULL,
                    prompt_text TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (session_id, subject)
                )`,
            ).run();
        })().catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    await schemaReady;
}

function parseItems(raw: string): MemoryItem[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((value) => {
            if (!value || typeof value !== 'object') return [];
            const item = value as Partial<MemoryItem>;
            if (typeof item.id !== 'string' || typeof item.kind !== 'string' || typeof item.text !== 'string') return [];
            const clarity = item.clarity === 'fuzzy' || item.clarity === 'trace' ? item.clarity : 'clear';
            return [{
                id: item.id,
                kind: item.kind,
                text: item.text,
                pin: item.pin === true,
                clarity,
                lastSeen: typeof item.lastSeen === 'number' ? item.lastSeen : 0,
            }];
        });
    } catch {
        return [];
    }
}

function mapCard(row: {
    subject: string;
    rev: string;
    items_json: string;
    prompt_text: string;
    updated_at: number;
}): MemoryCardRow {
    return {
        subject: row.subject,
        rev: row.rev,
        items: parseItems(row.items_json),
        promptText: row.prompt_text,
        updatedAt: row.updated_at,
    };
}

export async function readMemoryPrompt(
    env: Env,
    sessionId: string,
    speakerId: string,
): Promise<{roomRev: string; roomText: string; speakerRev: string; speakerText: string}> {
    const empty = {roomRev: '', roomText: '', speakerRev: '', speakerText: ''};
    const id = sessionId.trim();
    if (!isChatLogEnabled(env) || !id) return empty;
    await ensureSchema(env.XBOT_DB);
    const room = await env.XBOT_DB.prepare(
        `SELECT rev, prompt_text FROM chat_memory WHERE session_id = ?1 AND subject = ''`,
    ).bind(id).first<{rev: string; prompt_text: string}>();
    const speaker = speakerId.trim()
        ? await env.XBOT_DB.prepare(
            `SELECT rev, prompt_text FROM chat_memory WHERE session_id = ?1 AND subject = ?2`,
        ).bind(id, speakerId.trim()).first<{rev: string; prompt_text: string}>()
        : null;
    return {
        roomRev: room?.rev ?? '',
        roomText: room?.prompt_text ?? '',
        speakerRev: speaker?.rev ?? '',
        speakerText: speaker?.prompt_text ?? '',
    };
}

export async function listMemoryCards(env: Env, sessionId: string): Promise<MemoryCardRow[]> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return [];
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        `SELECT subject, rev, items_json, prompt_text, updated_at
         FROM chat_memory WHERE session_id = ?1`,
    ).bind(sessionId.trim()).all<{
        subject: string;
        rev: string;
        items_json: string;
        prompt_text: string;
        updated_at: number;
    }>();
    return (result.results ?? []).map(mapCard);
}

export async function writeMemoryCard(
    env: Env,
    sessionId: string,
    card: MemoryCardRow,
): Promise<void> {
    await ensureSchema(env.XBOT_DB);
    if (!card.items.length || !card.promptText) {
        await env.XBOT_DB.prepare(
            `DELETE FROM chat_memory WHERE session_id = ?1 AND subject = ?2`,
        ).bind(sessionId, card.subject).run();
        return;
    }
    await env.XBOT_DB.prepare(
        `INSERT INTO chat_memory (session_id, subject, rev, items_json, prompt_text, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(session_id, subject) DO UPDATE SET
           rev = excluded.rev,
           items_json = excluded.items_json,
           prompt_text = excluded.prompt_text,
           updated_at = excluded.updated_at`,
    ).bind(
        sessionId,
        card.subject,
        card.rev,
        JSON.stringify(card.items),
        card.promptText,
        card.updatedAt,
    ).run();
}

export async function listSessionsDue(env: Env, since: number, limit: number): Promise<DueSession[]> {
    if (!isChatLogEnabled(env)) return [];
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        `SELECT session_id, session_type, platform
         FROM chat_session
         WHERE last_message_at >= ?1
         ORDER BY last_message_at DESC
         LIMIT ?2`,
    ).bind(Math.floor(since), limit).all<{session_id: string; session_type: string; platform: string}>();
    return (result.results ?? []).map((row) => ({
        sessionId: row.session_id,
        sessionType: row.session_type,
        platform: row.platform,
    }));
}

export async function loadMemoryMaterial(
    env: Env,
    sessionId: string,
    sinceUnix: number,
): Promise<MemoryMaterialRow[]> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return [];
    await ensureSchema(env.XBOT_DB);
    // 计划和真正执行的是同一句，免得查的是一句、跑的是另一句
    const sql = `SELECT sender_id, sender_name, actor_type, msg_type, content_text, created_at
         FROM chat_message
         WHERE session_id = ?1 AND created_at >= ?2
         ORDER BY created_at DESC
         LIMIT 200`;
    const plan = await env.XBOT_DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(sessionId, sinceUnix).all<Record<string, unknown>>();
    const detail = (plan.results ?? []).map((row) => String(row.detail ?? '')).join('\n');
    if (/SCAN chat_message/iu.test(detail) || !/idx_chat_message_session_time/iu.test(detail)) {
        throw new MemoryQueryUnsafe(detail || '没有查询计划');
    }
    const result = await env.XBOT_DB.prepare(sql).bind(sessionId, sinceUnix).all<{
        sender_id: string;
        sender_name: string;
        actor_type: string;
        msg_type: string;
        content_text: string;
        created_at: number;
    }>();
    return (result.results ?? []).map((row) => ({
        senderId: row.sender_id,
        senderName: row.sender_name,
        actorType: row.actor_type,
        msgType: row.msg_type,
        contentText: row.content_text,
        createdAt: row.created_at,
    })).reverse();
}

/** 手动点名整理某个聊天时，用它查出平台，才认得出谁是主人。 */
export async function getChatSession(env: Env, sessionId: string): Promise<DueSession | null> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return null;
    await ensureSchema(env.XBOT_DB);
    const row = await env.XBOT_DB.prepare(
        `SELECT session_id, session_type, platform FROM chat_session WHERE session_id = ?1`,
    ).bind(sessionId.trim()).first<{session_id: string; session_type: string; platform: string}>();
    return row ? {sessionId: row.session_id, sessionType: row.session_type, platform: row.platform} : null;
}
