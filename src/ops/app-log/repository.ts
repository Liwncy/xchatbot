import type {Env} from '../../types/env.js';

export type AppLogLevel = 'WARN' | 'ERROR';

export interface AppLogInsert {
    level: AppLogLevel;
    message: string;
    detailJson?: string;
    createdAt?: number;
}

let schemaReady: Promise<void> | null = null;

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
}

export async function persistAppLog(env: Env, entry: AppLogInsert): Promise<void> {
    if (!env.XBOT_DB) return;
    await AppLogRepository.insert(env.XBOT_DB, entry);
}
