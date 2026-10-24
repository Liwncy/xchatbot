import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {NORMAL_ID, type Persona} from './types.js';

const RESTORE_COMMANDS = ['人格正常', '人格恢复'];
const NAME_PREFIXES = ['人格'];
const RESERVED = [
    '正常', '恢复', '人格',
    '加人格', '增加人格', '新增人格',
    '当前人格', '小聪明儿', 'normal',
];
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

type CatalogRow = {
    role_key: string;
    name: string;
    triggers: string;
    instruction: string;
    ack: string;
    status: string;
    sort_no: number;
};

let schemaReady: Promise<void> | null = null;
let catalogCache: {expiresAt: number; rows: Persona[]} | null = null;
let catalogLoading: Promise<Persona[]> | null = null;

function normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/gu, '');
}

function parseTriggers(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw.split(/[,，;；]/u).map((item) => item.trim()).filter(Boolean);
}

async function tableNames(db: D1Database): Promise<Set<string>> {
    const found = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('persona', 'roleplay_character')`,
    ).all<{name: string}>();
    return new Set((found.results ?? []).map((row) => row.name));
}

async function ensureSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            const names = await tableNames(db);
            if (names.has('roleplay_character') && !names.has('persona')) {
                await db.prepare('ALTER TABLE roleplay_character RENAME TO persona').run();
            }
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS persona (
                    role_key TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    triggers TEXT NOT NULL DEFAULT '',
                    instruction TEXT NOT NULL,
                    ack TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    sort_no INTEGER NOT NULL DEFAULT 100
                )`,
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_persona_status ON persona(status, sort_no)',
            ).run();
            const after = await tableNames(db);
            if (after.has('roleplay_character') && after.has('persona')) {
                await db.prepare(
                    `INSERT OR IGNORE INTO persona
                        (role_key, name, triggers, instruction, ack, status, sort_no)
                     SELECT role_key, name, triggers, instruction, ack, status, sort_no
                     FROM roleplay_character`,
                ).run();
                await db.prepare('DROP TABLE roleplay_character').run();
                logger.info('人格表已接过旧目录');
            }
            await db.prepare('DROP INDEX IF EXISTS idx_roleplay_character_status').run();
        })().catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    await schemaReady;
}

function mapRow(row: CatalogRow): Persona {
    return {
        id: row.role_key,
        name: row.name,
        triggers: parseTriggers(row.triggers),
        instruction: row.instruction,
        ack: row.ack,
    };
}

async function loadAll(env: Env): Promise<Persona[]> {
    if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.rows;
    if (!catalogLoading) {
        catalogLoading = (async () => {
            await ensureSchema(env.XBOT_DB);
            const result = await env.XBOT_DB.prepare(
                `SELECT role_key, name, triggers, instruction, ack, status, sort_no
                 FROM persona
                 WHERE status = 'active'
                 ORDER BY sort_no ASC, role_key ASC`,
            ).all<CatalogRow>();
            const rows = (result.results ?? []).map(mapRow);
            catalogCache = {expiresAt: Date.now() + CATALOG_CACHE_TTL_MS, rows};
            return rows;
        })().finally(() => {
            catalogLoading = null;
        });
    }
    return catalogLoading;
}

async function loadNameTokens(env: Env): Promise<Array<{id: string; name: string; triggers: string[]}>> {
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        'SELECT role_key, name, triggers FROM persona',
    ).all<Pick<CatalogRow, 'role_key' | 'name' | 'triggers'>>();
    return (result.results ?? []).map((row) => ({
        id: row.role_key,
        name: row.name,
        triggers: parseTriggers(row.triggers),
    }));
}

export function isQueryCommand(command: string): boolean {
    const key = normalize(command);
    return key === '当前人格';
}

export async function getPersona(env: Env, roleKey: string | undefined): Promise<Persona | null> {
    if (!roleKey?.trim() || roleKey === NORMAL_ID) return null;
    const want = normalize(roleKey);
    const row = (await loadAll(env)).find((item) => normalize(item.id) === want);
    return row ?? null;
}

export async function matchCommandId(env: Env, command: string): Promise<string | null> {
    const key = normalize(command);
    if (!key) return null;
    if (RESTORE_COMMANDS.some((item) => normalize(item) === key)) return NORMAL_ID;
    const map = new Map<string, string>();
    for (const persona of await loadAll(env)) {
        const register = (raw: string) => {
            const token = normalize(raw);
            if (token && !map.has(token)) map.set(token, persona.id);
        };
        register(persona.name);
        for (const alias of persona.triggers ?? []) register(alias);
        for (const prefix of NAME_PREFIXES) {
            register(prefix + persona.name);
            for (const alias of persona.triggers ?? []) register(prefix + alias);
        }
    }
    return map.get(key) ?? null;
}

export async function createPersona(
    env: Env,
    nameRaw: string,
    instructionRaw: string,
): Promise<string | null> {
    const name = nameRaw.trim();
    const instruction = instructionRaw.trim();
    if (!name) return '名字空了';
    if (name.length > 16) return '名字短一点';
    if (!instruction) return '怎么说写在名字后面';
    if (instruction.length > 4000) return '怎么说短一点';
    if (name.length > 32 || normalize(name) === NORMAL_ID || RESERVED.some((item) => normalize(item) === normalize(name))) {
        return '这名字不行';
    }
    const want = normalize(name);
    for (const row of await loadNameTokens(env)) {
        if (normalize(row.id) === want || normalize(row.name) === want) return '已经有这个了';
        if (row.triggers.some((alias) => normalize(alias) === want)) return '已经有这个了';
    }
    await ensureSchema(env.XBOT_DB);
    try {
        await env.XBOT_DB.prepare(
            `INSERT INTO persona
                (role_key, name, triggers, instruction, ack, status, sort_no)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(name, name, '', instruction, `好，${name}。`, 'active', 200).run();
    } catch {
        return '已经有这个了';
    }
    catalogCache = null;
    return null;
}
