import type {Env} from '../types/env.js';
import {parseBool} from '../utils/bool.js';
import {resolveChatSession} from './chat-log/session.js';
import type {IncomingMessage} from './message.js';
import {brainDisplayName, parseBrainName, type AgentBrain} from './brain-name.js';

export type BrainLayer = 'session' | 'platform' | 'default';

export type BrainConnection = {
    /** 这一只的名字，写在 KV 里，用来切换。 */
    key: string;
    /** 走哪一种插件。同一类型可以有多只。 */
    kind: AgentBrain | null;
    displayName: string;
    baseUrl: string;
    token: string;
    timeoutMs: number;
    enabled: boolean;
    appId: string;
    autoForward: boolean;
};

export type ActiveBrain = BrainConnection & {layer: BrainLayer};

type BrainRow = {
    brain_key: string;
    agent_kind: string;
    display_name: string;
    base_url: string;
    token: string;
    timeout_ms: number;
    enabled: number;
    is_default: number;
    app_id: string;
    auto_forward: number;
    updated_at: number;
};

const COLUMNS = 'brain_key, agent_kind, display_name, base_url, token, timeout_ms, enabled, is_default, app_id, auto_forward, updated_at';

let schemaReady: Promise<void> | null = null;

function trimSlash(value: string | undefined): string {
    return value?.trim().replace(/\/+$/u, '') ?? '';
}

function gatewayToken(env: Env, specific?: string): string {
    return specific?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '';
}

function openclawBase(env: Env): string {
    const explicit = trimSlash(env.XBOT_CHANNEL_GATEWAY_URL);
    if (explicit) return explicit;
    const bridge = trimSlash(env.AGENT_BRIDGE_BASE_URL);
    if (!bridge) return '';
    return bridge.endsWith('/v1') ? bridge.slice(0, -3) : bridge;
}

function timeoutOf(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 900_000) : fallback;
}

function sessionKey(message: IncomingMessage): string {
    const sessionId = resolveChatSession(message).sessionId;
    return `agent:brain:session:${message.platform}:${sessionId}`;
}

function platformKey(platform: string): string {
    return `agent:brain:platform:${platform}`;
}

async function ensureSchema(env: Env): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await env.XBOT_DB.prepare(
                `CREATE TABLE IF NOT EXISTS agent_brain (
                    brain_key TEXT PRIMARY KEY,
                    agent_kind TEXT NOT NULL DEFAULT '',
                    display_name TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    token TEXT NOT NULL DEFAULT '',
                    timeout_ms INTEGER NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    app_id TEXT NOT NULL DEFAULT '',
                    auto_forward INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                )`,
            ).run();
            const info = await env.XBOT_DB.prepare(`PRAGMA table_info(agent_brain)`).all<{name: string}>();
            const hasKind = (info.results ?? []).some((column) => column.name === 'agent_kind');
            if (!hasKind) {
                await env.XBOT_DB.prepare(
                    `ALTER TABLE agent_brain ADD COLUMN agent_kind TEXT NOT NULL DEFAULT ''`,
                ).run();
            }
            await env.XBOT_DB.prepare(
                `UPDATE agent_brain
                 SET agent_kind = brain_key
                 WHERE agent_kind = ''
                   AND brain_key IN ('openclaw', 'hermes', 'qwenpaw', 'snailai')`,
            ).run();
            const now = Date.now();
            const autoForward = env.XBOT_CHANNEL_AUTO_FORWARD == null
                ? 1
                : (parseBool(env.XBOT_CHANNEL_AUTO_FORWARD, false) ? 1 : 0);
            const seeds: Array<[string, string, string, string, number, number, string, number]> = [
                ['openclaw', 'OpenClaw', openclawBase(env), gatewayToken(env), 120_000, 1, '', autoForward],
                ['hermes', 'Hermes', trimSlash(env.HERMES_BASE_URL), gatewayToken(env, env.HERMES_TOKEN), 120_000, 0, '', 1],
                ['qwenpaw', 'QwenPaw', trimSlash(env.QWENPAW_BASE_URL), gatewayToken(env, env.QWENPAW_TOKEN), 120_000, 0, '', 1],
                ['snailai', 'SnailAI', trimSlash(env.SNAIL_AI_BASE_URL), env.SNAIL_AI_TOKEN?.trim() ?? '', 180_000, 0, env.SNAIL_AI_APP_ID?.trim() ?? '', 1],
            ];
            for (const [key, name, baseUrl, token, timeoutMs, isDefault, appId, forward] of seeds) {
                await env.XBOT_DB.prepare(
                    `INSERT OR IGNORE INTO agent_brain
                        (brain_key, display_name, base_url, token, timeout_ms, enabled, is_default, app_id, auto_forward, agent_kind, updated_at)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
                ).bind(key, name, baseUrl, token, timeoutMs, isDefault, appId, forward, key, now).run();
                if (!token || key === 'snailai') continue;
                await env.XBOT_DB.prepare(
                    `UPDATE agent_brain SET token = ?, updated_at = ? WHERE brain_key = ? AND token = ''`,
                ).bind(token, now, key).run();
            }
        })().catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    await schemaReady;
}

export function ensureBrainCatalog(env: Env): Promise<void> {
    return ensureSchema(env);
}

function rowKind(row: BrainRow): AgentBrain | null {
    return parseBrainName(row.agent_kind) ?? parseBrainName(row.brain_key);
}

function ready(row: BrainRow | null): row is BrainRow {
    return Boolean(row && row.enabled === 1 && rowKind(row));
}

async function rowByKey(env: Env, key: string): Promise<BrainRow | null> {
    await ensureSchema(env);
    const row = await env.XBOT_DB.prepare(
        `SELECT ${COLUMNS} FROM agent_brain WHERE brain_key = ?`,
    ).bind(key).first<BrainRow>();
    return row ?? null;
}

async function defaultRow(env: Env): Promise<BrainRow | null> {
    await ensureSchema(env);
    const row = await env.XBOT_DB.prepare(
        `SELECT ${COLUMNS} FROM agent_brain WHERE is_default = 1 LIMIT 1`,
    ).first<BrainRow>();
    return row ?? null;
}

async function rowMatching(env: Env, name: string): Promise<BrainRow | null> {
    await ensureSchema(env);
    const byKey = await env.XBOT_DB.prepare(
        `SELECT ${COLUMNS} FROM agent_brain WHERE lower(brain_key) = lower(?) LIMIT 1`,
    ).bind(name).first<BrainRow>();
    if (byKey) return byKey;
    const alias = parseBrainName(name);
    if (alias) {
        const aliased = await rowByKey(env, alias);
        if (aliased) return aliased;
    }
    const byName = await env.XBOT_DB.prepare(
        `SELECT ${COLUMNS} FROM agent_brain WHERE lower(display_name) = lower(?) LIMIT 1`,
    ).bind(name).first<BrainRow>();
    return byName ?? null;
}

function connectionFrom(env: Env, row: BrainRow): BrainConnection {
    const kind = rowKind(row);
    const displayName = row.display_name.trim() || (kind ? brainDisplayName(kind) : row.brain_key);
    if (kind === 'hermes') {
        return {
            key: row.brain_key,
            kind,
            displayName,
            baseUrl: trimSlash(row.base_url) || trimSlash(env.HERMES_BASE_URL),
            token: row.token.trim() || env.HERMES_TOKEN?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
            timeoutMs: row.timeout_ms || timeoutOf(env.HERMES_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
            enabled: row.enabled === 1,
            appId: '',
            autoForward: true,
        };
    }
    if (kind === 'qwenpaw') {
        return {
            key: row.brain_key,
            kind,
            displayName,
            baseUrl: trimSlash(row.base_url) || trimSlash(env.QWENPAW_BASE_URL),
            token: row.token.trim() || env.QWENPAW_TOKEN?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
            timeoutMs: row.timeout_ms || timeoutOf(env.QWENPAW_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
            enabled: row.enabled === 1,
            appId: '',
            autoForward: true,
        };
    }
    if (kind === 'snailai') {
        return {
            key: row.brain_key,
            kind,
            displayName,
            baseUrl: trimSlash(row.base_url) || trimSlash(env.SNAIL_AI_BASE_URL),
            token: row.token.trim() || env.SNAIL_AI_TOKEN?.trim() || '',
            timeoutMs: row.timeout_ms || timeoutOf(env.SNAIL_AI_TIMEOUT_MS, 180_000),
            enabled: row.enabled === 1,
            appId: row.app_id.trim() || env.SNAIL_AI_APP_ID?.trim() || '',
            autoForward: true,
        };
    }
    if (kind === 'openclaw') {
        return {
            key: row.brain_key,
            kind,
            displayName,
            baseUrl: trimSlash(row.base_url) || openclawBase(env),
            token: row.token.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
            timeoutMs: row.timeout_ms || timeoutOf(env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
            enabled: row.enabled === 1,
            appId: '',
            autoForward: row.auto_forward === 1,
        };
    }
    return {
        key: row.brain_key,
        kind: null,
        displayName,
        baseUrl: trimSlash(row.base_url),
        token: row.token.trim(),
        timeoutMs: row.timeout_ms,
        enabled: row.enabled === 1,
        appId: row.app_id.trim(),
        autoForward: row.auto_forward === 1,
    };
}

function hermesFallback(env: Env, layer: BrainLayer): ActiveBrain {
    return {
        key: 'hermes',
        kind: 'hermes',
        layer,
        displayName: 'Hermes',
        baseUrl: trimSlash(env.HERMES_BASE_URL),
        token: gatewayToken(env, env.HERMES_TOKEN),
        timeoutMs: timeoutOf(env.HERMES_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
        enabled: true,
        appId: '',
        autoForward: true,
    };
}

async function readKvRow(env: Env, key: string): Promise<BrainRow | null> {
    const raw = (await env.XBOT_KV.get(key))?.trim() ?? '';
    if (!raw) return null;
    const row = await rowByKey(env, raw);
    return ready(row) ? row : null;
}

export async function lookupBrain(env: Env, name: string): Promise<BrainConnection | null> {
    const row = await rowMatching(env, name);
    return row ? connectionFrom(env, row) : null;
}

export async function loadBrainConnection(env: Env, key: string): Promise<BrainConnection> {
    const row = await rowByKey(env, key);
    if (!row) return hermesFallback(env, 'default');
    return connectionFrom(env, row);
}

export async function currentBrain(env: Env, message: IncomingMessage): Promise<ActiveBrain> {
    const session = await readKvRow(env, sessionKey(message));
    if (session) return {...connectionFrom(env, session), layer: 'session'};
    const platform = await readKvRow(env, platformKey(message.platform));
    if (platform) return {...connectionFrom(env, platform), layer: 'platform'};
    const chosen = await defaultRow(env);
    const fallback = ready(chosen) ? chosen : await rowByKey(env, 'hermes');
    if (ready(fallback)) return {...connectionFrom(env, fallback), layer: 'default'};
    return hermesFallback(env, 'default');
}

export async function resolveAgentBrain(env: Env, message: IncomingMessage): Promise<AgentBrain> {
    return (await currentBrain(env, message)).kind ?? 'hermes';
}

export async function setSessionBrain(env: Env, message: IncomingMessage, key: string): Promise<void> {
    await env.XBOT_KV.put(sessionKey(message), key);
}

export async function setPlatformBrain(env: Env, platform: string, key: string): Promise<void> {
    await env.XBOT_KV.put(platformKey(platform), key);
}

export async function clearSessionBrain(env: Env, message: IncomingMessage): Promise<void> {
    await env.XBOT_KV.delete(sessionKey(message));
}

export async function clearPlatformBrain(env: Env, platform: string): Promise<void> {
    await env.XBOT_KV.delete(platformKey(platform));
}

export async function setDefaultBrain(env: Env, key: string): Promise<void> {
    await ensureSchema(env);
    await env.XBOT_DB.prepare(
        `UPDATE agent_brain
         SET is_default = CASE WHEN brain_key = ? THEN 1 ELSE 0 END,
             updated_at = ?`,
    ).bind(key, Date.now()).run();
}
