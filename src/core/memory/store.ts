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
            // 每个聊天整理到哪了。没有卡的聊天也要有这一行，所以不放在 chat_memory 里
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS chat_memory_mark (
                    session_id TEXT PRIMARY KEY,
                    material_at INTEGER NOT NULL,
                    ran_at INTEGER NOT NULL
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
            const lastSeen = typeof item.lastSeen === 'number' ? item.lastSeen : 0;
            // 老条目没有这几项：创建时间按最后提到算，重要度按「中等」补，约定再加一点
            const importance = typeof item.importance === 'number' && Number.isFinite(item.importance)
                ? item.importance
                : (item.kind === 'promise' ? 56 : 40);
            return [{
                id: item.id,
                kind: item.kind,
                text: item.text,
                pin: item.pin === true,
                clarity,
                createdAt: typeof item.createdAt === 'number' ? item.createdAt : lastSeen,
                lastSeen,
                importance,
                recallCount: typeof item.recallCount === 'number' ? item.recallCount : 0,
                retention: typeof item.retention === 'number' ? item.retention : 0,
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

/**
 * 人的卡不跟着聊天走：同一个人在哪个群、在私聊，都是同一张。
 * 存在 chat_memory 里，用这个固定的 session_id 当「人」这一类的位置，不会和真实聊天 id 撞。
 */
export const PEOPLE_SCOPE = '@people';

/** 人这张卡在 chat_memory 里的 subject。带上平台，不同平台里碰巧同 id 的不会混。 */
export function personKey(platform: string, senderId: string): string {
    return `${platform.trim() || 'wechat'}:${senderId.trim()}`;
}

/** 只读版本号、正文和上次整理的时间，不读条目。每条入站都会走到这里。 */
export async function readMemoryHead(
    env: Env,
    sessionId: string,
    subject: string,
): Promise<{rev: string; promptText: string; updatedAt: number} | null> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return null;
    await ensureSchema(env.XBOT_DB);
    const row = await env.XBOT_DB.prepare(
        `SELECT rev, prompt_text, updated_at FROM chat_memory WHERE session_id = ?1 AND subject = ?2`,
    ).bind(sessionId.trim(), subject).first<{rev: string; prompt_text: string; updated_at: number}>();
    return row ? {rev: row.rev, promptText: row.prompt_text, updatedAt: row.updated_at} : null;
}

export async function getMemoryCard(env: Env, sessionId: string, subject: string): Promise<MemoryCardRow | null> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return null;
    await ensureSchema(env.XBOT_DB);
    const row = await env.XBOT_DB.prepare(
        `SELECT subject, rev, items_json, prompt_text, updated_at
         FROM chat_memory WHERE session_id = ?1 AND subject = ?2`,
    ).bind(sessionId.trim(), subject).first<{
        subject: string;
        rev: string;
        items_json: string;
        prompt_text: string;
        updated_at: number;
    }>();
    return row ? mapCard(row) : null;
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

/**
 * 挑该整理的聊天：`since` 之后有过消息，而且有模型还没看过的；
 * `retryBefore` 之后刚试过的先不挑，免得一个老是失败的聊天每次都排在最前面。
 */
export async function listSessionsDue(
    env: Env,
    since: number,
    retryBefore: number,
    limit: number,
): Promise<DueSession[]> {
    if (!isChatLogEnabled(env)) return [];
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        `SELECT s.session_id, s.session_type, s.platform
         FROM chat_session s
         LEFT JOIN chat_memory_mark m ON m.session_id = s.session_id
         WHERE s.last_message_at >= ?1
           AND s.last_message_at > COALESCE(m.material_at, 0)
           AND COALESCE(m.ran_at, 0) < ?2
         ORDER BY s.last_message_at DESC
         LIMIT ?3`,
    ).bind(Math.floor(since), Math.floor(retryBefore), limit)
        .all<{session_id: string; session_type: string; platform: string}>();
    return (result.results ?? []).map((row) => ({
        sessionId: row.session_id,
        sessionType: row.session_type,
        platform: row.platform,
    }));
}

/** 模型已经看到哪一刻的发言了。没整理过是 0。 */
export async function readMemoryMark(env: Env, sessionId: string): Promise<number> {
    if (!isChatLogEnabled(env) || !sessionId.trim()) return 0;
    await ensureSchema(env.XBOT_DB);
    const row = await env.XBOT_DB.prepare(
        `SELECT material_at FROM chat_memory_mark WHERE session_id = ?1`,
    ).bind(sessionId.trim()).first<{material_at: number}>();
    return row?.material_at ?? 0;
}

/** 记下这次整理。`materialAt` 传 0 表示这次没看成，只记「试过了」，水位不动。 */
export async function writeMemoryMark(
    env: Env,
    sessionId: string,
    materialAt: number,
    ranAt: number,
): Promise<void> {
    await ensureSchema(env.XBOT_DB);
    await env.XBOT_DB.prepare(
        `INSERT INTO chat_memory_mark (session_id, material_at, ran_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET
           material_at = MAX(chat_memory_mark.material_at, excluded.material_at),
           ran_at = excluded.ran_at`,
    ).bind(sessionId, Math.floor(materialAt), Math.floor(ranAt)).run();
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
