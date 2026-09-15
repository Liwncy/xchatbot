import type {Env} from '../../types/env.js';
import type {AppLogRecord, AppLogSearch, WriteAppLog} from './types.js';

const MAX_SUMMARY = 300;
const MAX_DETAIL = 2000;

type AppLogRow = {
    id: number;
    created_at: number;
    level: string;
    stage: string;
    summary: string;
    detail: string;
    platform: string;
    session_id: string;
    message_id: string;
    plugin_name: string;
};

let schemaReady: Promise<void> | null = null;

export function isAppLogEnabled(env: Env): boolean {
    const raw = env.APP_LOG_ENABLE;
    if (typeof raw !== 'string') return true;
    const normalized = raw.trim().toLowerCase();
    return !['0', 'false', 'no', 'off', '关', '关闭'].includes(normalized);
}

function clip(value: string, max: number): string {
    const text = value.trim();
    return text.length <= max ? text : `${text.slice(0, max)}...`;
}

async function ensureSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS app_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at INTEGER NOT NULL,
                    level TEXT NOT NULL,
                    stage TEXT NOT NULL DEFAULT '',
                    summary TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    platform TEXT NOT NULL DEFAULT '',
                    session_id TEXT NOT NULL DEFAULT '',
                    message_id TEXT NOT NULL DEFAULT '',
                    plugin_name TEXT NOT NULL DEFAULT ''
                )`,
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_app_log_created ON app_log(created_at, id)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_app_log_level_created ON app_log(level, created_at)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_app_log_session_created ON app_log(session_id, created_at)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_app_log_message ON app_log(message_id)',
            ).run();
        })();
    }
    await schemaReady;
}

function mapRow(row: AppLogRow): AppLogRecord {
    return {
        id: row.id,
        createdAt: row.created_at,
        level: row.level === 'error' ? 'error' : 'warn',
        stage: row.stage,
        summary: row.summary,
        detail: row.detail,
        platform: row.platform,
        sessionId: row.session_id,
        messageId: row.message_id,
        pluginName: row.plugin_name,
    };
}

export async function recordAppLog(env: Env, entry: WriteAppLog): Promise<void> {
    if (!isAppLogEnabled(env) || !entry.summary.trim()) return;
    try {
        await ensureSchema(env.XBOT_DB);
        await env.XBOT_DB.prepare(
            `INSERT INTO app_log (
                created_at, level, stage, summary, detail,
                platform, session_id, message_id, plugin_name
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        ).bind(
            Math.floor(Date.now() / 1000),
            entry.level === 'error' ? 'error' : 'warn',
            (entry.stage ?? '').trim(),
            clip(entry.summary, MAX_SUMMARY),
            clip(entry.detail ?? '', MAX_DETAIL),
            (entry.platform ?? '').trim(),
            (entry.sessionId ?? '').trim(),
            (entry.messageId ?? '').trim(),
            (entry.pluginName ?? '').trim(),
        ).run();
    } catch (error) {
        console.error('运行日志写入失败', error instanceof Error ? error.message : String(error));
    }
}

export async function queryAppLogs(env: Env, query: AppLogSearch): Promise<AppLogRecord[]> {
    if (!isAppLogEnabled(env)) return [];
    await ensureSchema(env.XBOT_DB);

    const limit = Math.max(1, Math.min(query.limit, 200));
    const clauses: string[] = [];
    const binds: Array<string | number> = [];
    if (query.sessionId?.trim()) {
        binds.push(query.sessionId.trim());
        clauses.push(`session_id = ?${binds.length}`);
    }
    if (query.platform?.trim()) {
        binds.push(query.platform.trim());
        clauses.push(`platform = ?${binds.length}`);
    }
    if (query.level === 'warn' || query.level === 'error') {
        binds.push(query.level);
        clauses.push(`level = ?${binds.length}`);
    }
    if (query.stage?.trim()) {
        binds.push(query.stage.trim());
        clauses.push(`stage = ?${binds.length}`);
    }
    if (query.messageId?.trim()) {
        binds.push(query.messageId.trim());
        clauses.push(`message_id = ?${binds.length}`);
    }
    if (typeof query.sinceUnix === 'number' && Number.isFinite(query.sinceUnix)) {
        binds.push(Math.floor(query.sinceUnix));
        clauses.push(`created_at >= ?${binds.length}`);
    }
    if (typeof query.untilUnix === 'number' && Number.isFinite(query.untilUnix)) {
        binds.push(Math.floor(query.untilUnix));
        clauses.push(`created_at < ?${binds.length}`);
    }
    if (query.keyword?.trim()) {
        binds.push(`%${query.keyword.trim()}%`);
        const idx = binds.length;
        clauses.push(`(summary LIKE ?${idx} OR detail LIKE ?${idx} OR stage LIKE ?${idx})`);
    }
    const pageOlder = typeof query.beforeId === 'number' && query.beforeId > 0;
    const pageNewer = !pageOlder && typeof query.afterId === 'number' && query.afterId > 0;
    if (pageOlder) {
        binds.push(query.beforeId as number);
        clauses.push(`id < ?${binds.length}`);
    } else if (pageNewer) {
        binds.push(query.afterId as number);
        clauses.push(`id > ?${binds.length}`);
    }
    const chronologicalAsc = pageNewer || (query.sinceUnix != null && !pageOlder);
    binds.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await env.XBOT_DB.prepare(
        `SELECT * FROM app_log
         ${where}
         ORDER BY id ${chronologicalAsc ? 'ASC' : 'DESC'} LIMIT ?${binds.length}`,
    ).bind(...binds).all<AppLogRow>();
    const rows = (result.results ?? []).map(mapRow);
    return chronologicalAsc ? rows : rows.reverse();
}
