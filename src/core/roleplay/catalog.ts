import type {Env} from '../../types/env.js';
import {NORMAL_ID, type RoleplayCharacter} from './types.js';

const EXIT_COMMANDS = ['退出角色', '取消扮演', '不当了', '别演了'];
const NAME_PREFIXES = ['扮演', '当', '换成'];
const RESERVED = [
    '正常', '角色', '扮演', '当', '换成', '加角色', '增加角色', '新增角色',
    '退出角色', '取消扮演', '不当了', '别演了', '当前角色', '小聪明儿', 'normal',
];

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

function normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/gu, '');
}

function parseTriggers(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw.split(/[,，;；]/u).map((item) => item.trim()).filter(Boolean);
}

async function ensureSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS roleplay_character (
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
                'CREATE INDEX IF NOT EXISTS idx_roleplay_character_status ON roleplay_character(status, sort_no)',
            ).run();
        })();
    }
    await schemaReady;
}

function mapRow(row: CatalogRow): RoleplayCharacter {
    return {
        id: row.role_key,
        name: row.name,
        triggers: parseTriggers(row.triggers),
        instruction: row.instruction,
        ack: row.ack,
    };
}

async function loadAll(env: Env): Promise<RoleplayCharacter[]> {
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        `SELECT role_key, name, triggers, instruction, ack, status, sort_no
         FROM roleplay_character
         WHERE status = 'active'
         ORDER BY sort_no ASC, role_key ASC`,
    ).all<CatalogRow>();
    return (result.results ?? []).map(mapRow);
}

async function loadNameTokens(env: Env): Promise<Array<{id: string; name: string; triggers: string[]}>> {
    await ensureSchema(env.XBOT_DB);
    const result = await env.XBOT_DB.prepare(
        'SELECT role_key, name, triggers FROM roleplay_character',
    ).all<Pick<CatalogRow, 'role_key' | 'name' | 'triggers'>>();
    return (result.results ?? []).map((row) => ({
        id: row.role_key,
        name: row.name,
        triggers: parseTriggers(row.triggers),
    }));
}

export function isQueryCommand(command: string): boolean {
    const key = normalize(command);
    return key === '当前角色' || key === '现在演谁' || key === '你在演谁' || key === '演的谁';
}

export async function getCharacter(env: Env, roleKey: string | undefined): Promise<RoleplayCharacter | null> {
    if (!roleKey?.trim() || roleKey === NORMAL_ID) return null;
    const want = normalize(roleKey);
    const row = (await loadAll(env)).find((item) => normalize(item.id) === want);
    return row ?? null;
}

export async function matchCommandId(env: Env, command: string): Promise<string | null> {
    const key = normalize(command);
    if (!key) return null;
    if (EXIT_COMMANDS.some((item) => normalize(item) === key)) return NORMAL_ID;
    const map = new Map<string, string>();
    for (const character of await loadAll(env)) {
        const register = (raw: string) => {
            const token = normalize(raw);
            if (token && !map.has(token)) map.set(token, character.id);
        };
        register(character.name);
        for (const alias of character.triggers ?? []) register(alias);
        for (const prefix of NAME_PREFIXES) {
            register(prefix + character.name);
            for (const alias of character.triggers ?? []) register(prefix + alias);
        }
    }
    return map.get(key) ?? null;
}

export async function createCharacter(
    env: Env,
    nameRaw: string,
    instructionRaw: string,
): Promise<string | null> {
    const name = nameRaw.trim();
    const instruction = instructionRaw.trim();
    if (!name) return '名字空了';
    if (name.length > 16) return '名字短一点';
    if (!instruction) return '演法写在名字后面';
    if (instruction.length > 4000) return '演法短一点';
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
            `INSERT INTO roleplay_character
                (role_key, name, triggers, instruction, ack, status, sort_no)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(name, name, '', instruction, `好，${name}。`, 'active', 200).run();
    } catch {
        return '已经有这个了';
    }
    return null;
}
