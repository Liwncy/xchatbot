import {logger} from '../../utils/logger.js';
import {rosterSessionId} from './scope.js';
import {inferShoutType, normalizeShoutTemplate} from './template.js';
import {
    FALLBACK_TITLE,
    PEER_SHOUT_TYPES,
    PEER_SOURCES,
    PEER_STATUSES,
    type PeerRoute,
    type PeerRouteInput,
    type PeerShoutType,
    type PeerSource,
    type PeerStatus,
} from './types.js';

interface PeerRow {
    id: number;
    session_id: string;
    member_id: string | null;
    member_name: string;
    title: string;
    about: string | null;
    type: string | null;
    template: string | null;
    mention: number | null;
    example: string | null;
    status: string | null;
    source: string | null;
    created_at: number;
    updated_at: number;
}

const TABLE = 'chat_peer_route';
/** 第一版的表：列叫 scope / wxid / name / topic，还带 fallback。和聊天记录、记忆卡也不在一组。 */
const LEGACY_TABLE = 'peer_route';

let schemaReady: Promise<void> | undefined;

async function existingTables(db: D1Database): Promise<Set<string>> {
    const found = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)`,
    ).bind(LEGACY_TABLE, TABLE).all<{name: string}>();
    return new Set((found.results ?? []).map((row) => row.name));
}

/**
 * chat_peer_route 的列，按用途分五组（含义的细说在 types.ts 的 PeerRoute）：
 * - 哪个群、谁：session_id、member_id、member_name
 * - 会啥：title（线路名，代码认它）、about（具体的事，AI 读）
 * - 怎么喊：template、mention（type 是 template 的结果，example 是例子，都只是记着）
 * - 状态：status、source
 * - 时间：created_at、updated_at
 */
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    member_id TEXT NOT NULL DEFAULT '',
    member_name TEXT NOT NULL,
    title TEXT NOT NULL,
    about TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'chat',
    template TEXT NOT NULL DEFAULT '',
    mention INTEGER NOT NULL DEFAULT 1,
    example TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)`;
const CREATE_UNIQUE_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_peer_route_member_title
    ON ${TABLE}(session_id, member_id, title)`;
const CREATE_STATUS_INDEX = `CREATE INDEX IF NOT EXISTS idx_chat_peer_route_session_status
    ON ${TABLE}(session_id, status)`;

/**
 * 旧表的行转进新表（旧表原样留着，不删不改，回滚就是退回旧代码）：
 * - scope 去掉 `group:` 前缀，和 chat_message.session_id 一个写法；
 * - fallback=1 的行 title 记成「兜底」，about 沿用老的 topic；别的行 title、about 都取老 topic；
 * - 老的喊法类型 tail / talk 换成 param / chat；
 * - 老行都是手填的，source=manual。
 */
const COPY_FROM_LEGACY = `INSERT OR IGNORE INTO ${TABLE}
    (session_id, member_id, member_name, title, about, type, template, mention, example, status, source, created_at, updated_at)
    SELECT
        CASE WHEN substr(scope, 1, 6) = 'group:' THEN substr(scope, 7) ELSE scope END,
        COALESCE(wxid, ''),
        name,
        CASE WHEN fallback = 1 THEN '${FALLBACK_TITLE}' ELSE topic END,
        topic,
        CASE type WHEN 'tail' THEN 'param' WHEN 'talk' THEN 'chat' ELSE COALESCE(type, 'chat') END,
        COALESCE(template, ''),
        COALESCE(mention, 1),
        COALESCE(example, ''),
        COALESCE(status, 'active'),
        'manual',
        created_at,
        updated_at
    FROM ${LEGACY_TABLE}`;

/**
 * 新表不存在才建；旧表在就在同一个事务里把行复制过来。
 * 放在代码里而不是手工灌库：代码和库分开上线时，手工改完、新代码还没到的那一会儿，
 * 旧代码会按自己的表继续写，数据就分到两处了。放进同一个事务，也不会出现「表建了、行没搬完」。
 */
export async function ensurePeerRosterSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            const tables = await existingTables(db);
            if (tables.has(TABLE)) return;
            const steps = [
                db.prepare(CREATE_TABLE),
                db.prepare(CREATE_UNIQUE_INDEX),
                db.prepare(CREATE_STATUS_INDEX),
            ];
            if (tables.has(LEGACY_TABLE)) steps.push(db.prepare(COPY_FROM_LEGACY));
            await db.batch(steps);
            if (tables.has(LEGACY_TABLE)) {
                logger.info('花名册已从旧表复制，旧表留着当备份', {legacy: LEGACY_TABLE, current: TABLE});
            }
        })().catch((error) => {
            // 失败别留在缓存里：下一次请求重试，不要让这个实例一直报同一个错
            schemaReady = undefined;
            throw error;
        });
    }
    await schemaReady;
}

function normalizeStatus(value: string | null | undefined): PeerStatus {
    const text = (value ?? '').trim().toLowerCase();
    if ((PEER_STATUSES as readonly string[]).includes(text)) return text as PeerStatus;
    return 'active';
}

function normalizeType(value: string | null | undefined, template: string): PeerShoutType {
    const text = (value ?? '').trim().toLowerCase();
    if ((PEER_SHOUT_TYPES as readonly string[]).includes(text)) return text as PeerShoutType;
    return inferShoutType(template);
}

function normalizeSource(value: string | null | undefined): PeerSource {
    const text = (value ?? '').trim().toLowerCase();
    return (PEER_SOURCES as readonly string[]).includes(text) ? text as PeerSource : 'manual';
}

function mapRow(row: PeerRow): PeerRoute {
    const template = row.template ?? '';
    return {
        id: row.id,
        sessionId: row.session_id,
        memberId: row.member_id?.trim() ?? '',
        memberName: row.member_name,
        title: row.title,
        about: row.about?.trim() || row.title,
        type: normalizeType(row.type, template),
        template,
        mention: row.mention !== 0,
        example: row.example ?? '',
        status: normalizeStatus(row.status),
        source: normalizeSource(row.source),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function upsertPeerRoute(db: D1Database, input: PeerRouteInput): Promise<PeerRoute> {
    await ensurePeerRosterSchema(db);
    const sessionId = rosterSessionId(input.scope);
    const memberId = input.wxid?.trim() ?? '';
    const memberName = input.name.trim();
    const title = input.title.trim();
    const aboutGiven = Boolean(input.about?.trim());
    const about = input.about?.trim() || title;
    const parsed = normalizeShoutTemplate(input.template ?? '');
    const mention = input.mention ?? parsed.type !== 'fixed';
    const status = normalizeStatus(input.status);
    const source = normalizeSource(input.source);
    const now = Date.now();
    if (source === 'auto') {
        // 一件事只挂一个人：别人也会这件事时，新见到的替换旧的自动条目。
        // 但手填的是你明说的，自动整理不动它，也不在它旁边再挂一个人。
        // 这个人自己已有的行如果是手填的或被停用了，自动整理本来就改不了它；别白白把别人挤掉
        const own = await db.prepare(
            `SELECT * FROM ${TABLE} WHERE session_id = ? AND member_id = ? AND title = ?`,
        ).bind(sessionId, memberId, title).first<PeerRow>();
        if (own && (normalizeSource(own.source) === 'manual' || normalizeStatus(own.status) !== 'active')) {
            return mapRow(own);
        }
        const rivals = await db.prepare(
            `SELECT * FROM ${TABLE}
             WHERE session_id = ? AND title = ? COLLATE NOCASE AND member_id <> ? AND status = 'active'`,
        ).bind(sessionId, title, memberId).all<PeerRow>();
        const rows = rivals.results ?? [];
        const manual = rows.find((row) => normalizeSource(row.source) === 'manual');
        if (manual) return mapRow(manual);
        for (const row of rows) {
            await db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).bind(row.id).run();
        }
    }
    // 同一个人同一个 title 新的直接覆盖旧的（唯一键 session_id + member_id + title）。自动整理出来的只有两种情况能覆盖：
    // 已有的也是自动的、且没被停用。手填的不被改，停用了的（有人说过不喊他了）也不会被自动复活。
    await db.prepare(
        `INSERT INTO ${TABLE}
            (session_id, member_id, member_name, title, about, type, template, mention, example, status, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, member_id, title) DO UPDATE SET
            member_name = excluded.member_name,
            about = CASE WHEN ? = 1 THEN excluded.about ELSE ${TABLE}.about END,
            type = excluded.type,
            template = excluded.template,
            mention = excluded.mention,
            example = CASE WHEN excluded.example = '' THEN ${TABLE}.example ELSE excluded.example END,
            status = excluded.status,
            source = excluded.source,
            updated_at = excluded.updated_at
         WHERE excluded.source = 'manual'
            OR (${TABLE}.source = 'auto' AND ${TABLE}.status = 'active')`,
    ).bind(
        sessionId,
        memberId,
        memberName,
        title,
        about,
        parsed.type,
        parsed.template,
        mention ? 1 : 0,
        parsed.example,
        status,
        source,
        now,
        now,
        aboutGiven ? 1 : 0,
    ).run();
    const row = await db.prepare(
        `SELECT * FROM ${TABLE} WHERE session_id = ? AND member_id = ? AND title = ?`,
    ).bind(sessionId, memberId, title).first<PeerRow>();
    if (!row) throw new Error('peer route missing after upsert');
    return mapRow(row);
}

export async function listPeerRoutes(
    db: D1Database,
    scope: string,
    includeInactive = false,
): Promise<PeerRoute[]> {
    await ensurePeerRosterSchema(db);
    const sessionId = rosterSessionId(scope);
    // 兜底在前，其次最近写过的在前
    const order = `ORDER BY (title = '${FALLBACK_TITLE}') DESC, updated_at DESC, member_name ASC, title ASC`;
    const result = includeInactive
        ? await db.prepare(`SELECT * FROM ${TABLE} WHERE session_id = ? ${order}`).bind(sessionId).all<PeerRow>()
        : await db.prepare(
            `SELECT * FROM ${TABLE} WHERE session_id = ? AND status = 'active' ${order}`,
        ).bind(sessionId).all<PeerRow>();
    return (result.results ?? []).map(mapRow);
}

export async function searchPeerRoutes(
    db: D1Database,
    scope: string,
    query: string,
    includeInactive = false,
): Promise<PeerRoute[]> {
    const rows = await listPeerRoutes(db, scope, includeInactive);
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
        const hay = [row.title, row.about, row.memberName, row.template, row.example].join(' ').toLowerCase();
        return hay.includes(needle);
    });
}

export async function disablePeerRoute(
    db: D1Database,
    scope: string,
    match: {id?: number; wxid?: string; title?: string},
): Promise<PeerRoute | null> {
    await ensurePeerRosterSchema(db);
    const sessionId = rosterSessionId(scope);
    const now = Date.now();
    if (match.id) {
        await db.prepare(
            `UPDATE ${TABLE} SET status = 'disabled', updated_at = ? WHERE id = ? AND session_id = ?`,
        ).bind(now, match.id, sessionId).run();
        const row = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).bind(match.id).first<PeerRow>();
        return row ? mapRow(row) : null;
    }
    const memberId = match.wxid?.trim() ?? '';
    const title = match.title?.trim() ?? '';
    if (!memberId && !title) return null;
    const existing = (await listPeerRoutes(db, scope, true)).find((row) => {
        if (memberId && row.memberId !== memberId) return false;
        if (title && row.title !== title) return false;
        return true;
    });
    if (!existing) return null;
    await db.prepare(
        `UPDATE ${TABLE} SET status = 'disabled', updated_at = ? WHERE id = ?`,
    ).bind(now, existing.id).run();
    return {...existing, status: 'disabled', updatedAt: now};
}
