import type {Env} from '../../types/env.js';
import {normalizeLlmType, type LlmConfig, type LlmType} from './types.js';

interface LlmRow {
    name: string;
    type: string;
    api_url: string;
    api_key: string;
    model: string;
    is_default: number;
    updated_at: number;
}

const COLUMNS = 'name, type, api_url, api_key, model, is_default, updated_at';

let schemaReady: Promise<void> | undefined;

export async function ensureLlmSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS llm_config (
                    name TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'chat',
                    api_url TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    model TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                )`,
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_llm_config_type_default ON llm_config(type, is_default)',
            ).run();
        })();
    }
    await schemaReady;
}

function mapRow(row: LlmRow): LlmConfig {
    return {
        name: row.name,
        type: normalizeLlmType(row.type),
        apiUrl: row.api_url,
        apiKey: row.api_key,
        model: row.model,
        isDefault: row.is_default === 1,
        updatedAt: row.updated_at,
    };
}

function requireDb(env: Env): D1Database {
    if (!env.XBOT_DB) throw new Error('XBOT_DB 未绑定');
    return env.XBOT_DB;
}

export async function listLlmConfigs(env: Env): Promise<LlmConfig[]> {
    const db = requireDb(env);
    await ensureLlmSchema(db);
    const result = await db.prepare(
        `SELECT ${COLUMNS} FROM llm_config ORDER BY type ASC, is_default DESC, name ASC`,
    ).all<LlmRow>();
    return (result.results ?? []).map(mapRow);
}

export async function getLlmConfig(env: Env, name: string): Promise<LlmConfig | null> {
    const db = requireDb(env);
    await ensureLlmSchema(db);
    const row = await db.prepare(`SELECT ${COLUMNS} FROM llm_config WHERE name = ?`)
        .bind(name)
        .first<LlmRow>();
    return row ? mapRow(row) : null;
}

export async function getDefaultLlmConfig(env: Env, type: LlmType = 'chat'): Promise<LlmConfig | null> {
    const db = requireDb(env);
    await ensureLlmSchema(db);
    const row = await db.prepare(
        `SELECT ${COLUMNS} FROM llm_config WHERE type = ? AND is_default = 1 LIMIT 1`,
    ).bind(type).first<LlmRow>();
    if (row) return mapRow(row);
    const first = await db.prepare(
        `SELECT ${COLUMNS} FROM llm_config WHERE type = ? ORDER BY name ASC LIMIT 1`,
    ).bind(type).first<LlmRow>();
    return first ? mapRow(first) : null;
}

export async function upsertLlmConfig(
    env: Env,
    input: {
        name: string;
        type: LlmType;
        apiUrl: string;
        apiKey: string;
        model: string;
        makeDefault?: boolean;
    },
): Promise<LlmConfig> {
    const db = requireDb(env);
    await ensureLlmSchema(db);
    const existing = await getLlmConfig(env, input.name);
    const sameTypeCount = await db.prepare(
        'SELECT COUNT(*) AS cnt FROM llm_config WHERE type = ?',
    ).bind(input.type).first<{cnt: number}>();
    const makeDefault = input.makeDefault
        || !existing && (sameTypeCount?.cnt ?? 0) === 0
        || Boolean(existing?.isDefault && existing.type === input.type);
    const now = Date.now();
    if (makeDefault) {
        await db.prepare('UPDATE llm_config SET is_default = 0 WHERE type = ? AND is_default = 1')
            .bind(input.type)
            .run();
    }
    await db.prepare(
        `INSERT INTO llm_config (name, type, api_url, api_key, model, is_default, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
            type = excluded.type,
            api_url = excluded.api_url,
            api_key = excluded.api_key,
            model = excluded.model,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at`,
    ).bind(input.name, input.type, input.apiUrl, input.apiKey, input.model, makeDefault ? 1 : 0, now).run();
    const saved = await getLlmConfig(env, input.name);
    if (!saved) throw new Error('模型没记下');
    return saved;
}

export async function setDefaultLlmConfig(env: Env, name: string): Promise<LlmConfig | null> {
    const existing = await getLlmConfig(env, name);
    if (!existing) return null;
    const db = requireDb(env);
    await db.batch([
        db.prepare('UPDATE llm_config SET is_default = 0 WHERE type = ? AND is_default = 1').bind(existing.type),
        db.prepare('UPDATE llm_config SET is_default = 1, updated_at = ? WHERE name = ?').bind(Date.now(), name),
    ]);
    return getLlmConfig(env, name);
}

export async function deleteLlmConfig(env: Env, name: string): Promise<boolean> {
    const existing = await getLlmConfig(env, name);
    if (!existing) return false;
    const db = requireDb(env);
    await db.prepare('DELETE FROM llm_config WHERE name = ?').bind(name).run();
    if (existing.isDefault) {
        const next = await db.prepare(
            'SELECT name FROM llm_config WHERE type = ? ORDER BY name ASC LIMIT 1',
        ).bind(existing.type).first<{name: string}>();
        if (next?.name) {
            await db.prepare('UPDATE llm_config SET is_default = 1, updated_at = ? WHERE name = ?')
                .bind(Date.now(), next.name)
                .run();
        }
    }
    return true;
}
