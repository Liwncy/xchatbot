import type {Env} from '../../types/env.js';

export type AppLogLevel = 'WARN' | 'ERROR';

export interface AppLogInsert {
    level: AppLogLevel;
    message: string;
    detailJson?: string;
    createdAt?: number;
}

export interface AppLogRecord {
    id: number;
    level: string;
    message: string;
    detailJson: string;
    createdAt: number;
}

export interface AppLogQueryOptions {
    level?: AppLogLevel;
    keyword?: string;
    limit?: number;
}

type AppLogRow = {
    id: number;
    level: string;
    message: string;
    detail_json: string;
    created_at: number;
};

const DEFAULT_QUERY_LIMIT = 10;
const MAX_QUERY_LIMIT = 50;

let schemaReady: Promise<void> | null = null;

function clampLimit(limit?: number): number {
    if (limit == null || !Number.isFinite(limit)) return DEFAULT_QUERY_LIMIT;
    return Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.floor(limit)));
}

function mapRow(row: AppLogRow): AppLogRecord {
    return {
        id: row.id,
        level: row.level,
        message: row.message,
        detailJson: row.detail_json,
        createdAt: row.created_at,
    };
}

export class AppLogRepository {
    private static readonly CREATE_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS app_log ('
        + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
        + 'level TEXT NOT NULL, '
        + "message TEXT NOT NULL DEFAULT '', "
        + "detail_json TEXT NOT NULL DEFAULT '[]', "
        + 'created_at INTEGER NOT NULL'
        + ')';

    private static readonly CREATE_INDEXES_SQL = [
        'CREATE INDEX IF NOT EXISTS idx_app_log_created_at ON app_log(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_app_log_level_created_at ON app_log(level, created_at)',
    ];

    static async ensureSchema(db: D1Database): Promise<void> {
        if (!schemaReady) {
            schemaReady = (async () => {
                await db.prepare(AppLogRepository.CREATE_TABLE_SQL).run();
                for (const sql of AppLogRepository.CREATE_INDEXES_SQL) {
                    await db.prepare(sql).run();
                }
            })().catch((error) => {
                schemaReady = null;
                throw error;
            });
        }
        await schemaReady;
    }

    static async insert(db: D1Database, entry: AppLogInsert): Promise<void> {
        await AppLogRepository.ensureSchema(db);
        const createdAt = entry.createdAt ?? Math.floor(Date.now() / 1000);
        await db.prepare(
            `INSERT INTO app_log (level, message, detail_json, created_at)
             VALUES (?1, ?2, ?3, ?4)`,
        ).bind(
            entry.level,
            entry.message,
            entry.detailJson ?? '[]',
            createdAt,
        ).run();
    }

    static async listRecent(db: D1Database, options: AppLogQueryOptions = {}): Promise<AppLogRecord[]> {
        await AppLogRepository.ensureSchema(db);
        const limit = clampLimit(options.limit);
        const level = options.level?.trim().toUpperCase();
        const keyword = options.keyword?.trim();

        if (level && keyword) {
            const like = `%${keyword}%`;
            const result = await db.prepare(
                `SELECT id, level, message, detail_json, created_at
                 FROM app_log
                 WHERE level = ?1
                   AND (message LIKE ?2 OR detail_json LIKE ?2)
                 ORDER BY id DESC
                 LIMIT ?3`,
            ).bind(level, like, limit).all<AppLogRow>();
            return (result.results ?? []).map(mapRow);
        }

        if (level) {
            const result = await db.prepare(
                `SELECT id, level, message, detail_json, created_at
                 FROM app_log
                 WHERE level = ?1
                 ORDER BY id DESC
                 LIMIT ?2`,
            ).bind(level, limit).all<AppLogRow>();
            return (result.results ?? []).map(mapRow);
        }

        if (keyword) {
            const like = `%${keyword}%`;
            const result = await db.prepare(
                `SELECT id, level, message, detail_json, created_at
                 FROM app_log
                 WHERE message LIKE ?1 OR detail_json LIKE ?1
                 ORDER BY id DESC
                 LIMIT ?2`,
            ).bind(like, limit).all<AppLogRow>();
            return (result.results ?? []).map(mapRow);
        }

        const result = await db.prepare(
            `SELECT id, level, message, detail_json, created_at
             FROM app_log
             ORDER BY id DESC
             LIMIT ?1`,
        ).bind(limit).all<AppLogRow>();
        return (result.results ?? []).map(mapRow);
    }
}

export async function persistAppLog(env: Env, entry: AppLogInsert): Promise<void> {
    if (!env.XBOT_DB) return;
    await AppLogRepository.insert(env.XBOT_DB, entry);
}

export async function queryAppLogs(env: Env, options: AppLogQueryOptions = {}): Promise<AppLogRecord[]> {
    if (!env.XBOT_DB) return [];
    return AppLogRepository.listRecent(env.XBOT_DB, options);
}
