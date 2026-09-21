import {normalizeRosterScope} from './scope.js';
import {inferShoutType, normalizeShoutTemplate} from './template.js';
import {
    PEER_SHOUT_TYPES,
    PEER_STATUSES,
    type PeerRoute,
    type PeerRouteInput,
    type PeerShoutType,
    type PeerStatus,
} from './types.js';

interface PeerRow {
    id: number;
    scope: string;
    wxid: string | null;
    name: string;
    topic: string;
    type: string | null;
    template: string | null;
    mention: number | null;
    example: string | null;
    fallback: number | null;
    status: string | null;
    created_at: number;
    updated_at: number;
}

let schemaReady: Promise<void> | undefined;

export async function ensurePeerRosterSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS peer_route (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scope TEXT NOT NULL,
                    wxid TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    type TEXT NOT NULL DEFAULT 'talk',
                    template TEXT NOT NULL DEFAULT '',
                    mention INTEGER NOT NULL DEFAULT 1,
                    example TEXT NOT NULL DEFAULT '',
                    fallback INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )`,
            ).run();
            await db.prepare(
                'CREATE UNIQUE INDEX IF NOT EXISTS idx_peer_route_scope_wxid_topic ON peer_route(scope, wxid, topic)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_peer_route_scope_status ON peer_route(scope, status, fallback)',
            ).run();
        })();
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

function mapRow(row: PeerRow): PeerRoute {
    const template = row.template ?? '';
    return {
        id: row.id,
        scope: row.scope,
        wxid: row.wxid?.trim() ?? '',
        name: row.name,
        topic: row.topic,
        type: normalizeType(row.type, template),
        template,
        mention: row.mention !== 0,
        example: row.example ?? '',
        fallback: row.fallback === 1,
        status: normalizeStatus(row.status),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function upsertPeerRoute(db: D1Database, input: PeerRouteInput): Promise<PeerRoute> {
    await ensurePeerRosterSchema(db);
    const scope = normalizeRosterScope(input.scope);
    const wxid = input.wxid?.trim() ?? '';
    const name = input.name.trim();
    const topic = input.topic.trim();
    const parsed = normalizeShoutTemplate(input.template ?? '');
    const mention = input.mention ?? parsed.type !== 'fixed';
    const fallback = Boolean(input.fallback);
    const status = normalizeStatus(input.status);
    const now = Date.now();
    await db.prepare(
        `INSERT INTO peer_route
            (scope, wxid, name, topic, type, template, mention, example, fallback, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope, wxid, topic) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            template = excluded.template,
            mention = excluded.mention,
            example = CASE WHEN excluded.example = '' THEN peer_route.example ELSE excluded.example END,
            fallback = excluded.fallback,
            status = excluded.status,
            updated_at = excluded.updated_at`,
    ).bind(
        scope,
        wxid,
        name,
        topic,
        parsed.type,
        parsed.template,
        mention ? 1 : 0,
        parsed.example,
        fallback ? 1 : 0,
        status,
        now,
        now,
    ).run();
    const row = await db.prepare(
        `SELECT * FROM peer_route WHERE scope = ? AND wxid = ? AND topic = ?`,
    ).bind(scope, wxid, topic).first<PeerRow>();
    if (!row) throw new Error('peer route missing after upsert');
    return mapRow(row);
}

export async function listPeerRoutes(
    db: D1Database,
    scope: string,
    includeInactive = false,
): Promise<PeerRoute[]> {
    await ensurePeerRosterSchema(db);
    const normalized = normalizeRosterScope(scope);
    const result = includeInactive
        ? await db.prepare(
            `SELECT * FROM peer_route WHERE scope = ? ORDER BY fallback DESC, name ASC, topic ASC`,
        ).bind(normalized).all<PeerRow>()
        : await db.prepare(
            `SELECT * FROM peer_route WHERE scope = ? AND status = 'active' ORDER BY fallback DESC, name ASC, topic ASC`,
        ).bind(normalized).all<PeerRow>();
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
        const hay = [row.topic, row.name, row.template, row.example].join(' ').toLowerCase();
        return hay.includes(needle);
    });
}

export async function disablePeerRoute(
    db: D1Database,
    scope: string,
    match: {id?: number; wxid?: string; topic?: string},
): Promise<PeerRoute | null> {
    await ensurePeerRosterSchema(db);
    const normalized = normalizeRosterScope(scope);
    const now = Date.now();
    if (match.id) {
        await db.prepare(
            `UPDATE peer_route SET status = 'disabled', updated_at = ? WHERE id = ? AND scope = ?`,
        ).bind(now, match.id, normalized).run();
        const row = await db.prepare('SELECT * FROM peer_route WHERE id = ?').bind(match.id).first<PeerRow>();
        return row ? mapRow(row) : null;
    }
    const wxid = match.wxid?.trim() ?? '';
    const topic = match.topic?.trim() ?? '';
    if (!wxid && !topic) return null;
    const existing = (await listPeerRoutes(db, normalized, true)).find((row) => {
        if (wxid && row.wxid !== wxid) return false;
        if (topic && row.topic !== topic) return false;
        return true;
    });
    if (!existing) return null;
    await db.prepare(
        `UPDATE peer_route SET status = 'disabled', updated_at = ? WHERE id = ?`,
    ).bind(now, existing.id).run();
    return {...existing, status: 'disabled', updatedAt: now};
}
