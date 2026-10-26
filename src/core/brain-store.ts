import type {Env} from '../types/env.js';
import {parseBool} from '../utils/bool.js';
import {resolveChatSession} from './chat-log/session.js';
import type {IncomingMessage} from './message.js';
import {brainDisplayName, parseBrainName, type AgentBrain} from './brain-name.js';

export type BrainLayer = 'session' | 'platform' | 'default';

export type BrainConnection = {
    key: AgentBrain;
    displayName: string;
    baseUrl: string;
    token: string;
    timeoutMs: number;
    enabled: boolean;
    appId: string;
    autoForward: boolean;
};

type BrainRow = {
    brain_key: string;
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

const COLUMNS = 'brain_key, display_name, base_url, token, timeout_ms, enabled, is_default, app_id, auto_forward, updated_at';

let schemaReady: Promise<void> | null = null;

function trimSlash(value: string | undefined): string {
    return value?.trim().replace(/\/+$/u, '') ?? '';
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
            const now = Date.now();
            const autoForward = env.XBOT_CHANNEL_AUTO_FORWARD == null
                ? 1
                : (parseBool(env.XBOT_CHANNEL_AUTO_FORWARD, false) ? 1 : 0);
            const seeds: Array<[string, string, string, string, number, number, string, number]> = [
                ['hermes', 'Hermes', trimSlash(env.HERMES_BASE_URL), env.HERMES_TOKEN?.trim() ?? '', 120_000, 0, '', 1],
                ['openclaw', 'OpenClaw', openclawBase(env), env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() ?? '', 120_000, 1, '', autoForward],
                ['qwenpaw', 'QwenPaw', trimSlash(env.QWENPAW_BASE_URL), env.QWENPAW_TOKEN?.trim() ?? '', 120_000, 0, '', 1],
                ['snailai', 'SnailAI', trimSlash(env.SNAIL_AI_BASE_URL), env.SNAIL_AI_TOKEN?.trim() ?? '', 180_000, 0, env.SNAIL_AI_APP_ID?.trim() ?? '', 1],
            ];
            for (const [key, name, baseUrl, token, timeoutMs, isDefault, appId, forward] of seeds) {
                await env.XBOT_DB.prepare(
                    `INSERT OR IGNORE INTO agent_brain
                        (brain_key, display_name, base_url, token, timeout_ms, enabled, is_default, app_id, auto_forward, updated_at)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
                ).bind(key, name, baseUrl, token, timeoutMs, isDefault, appId, forward, now).run();
            }
        })().catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    await schemaReady;
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

function usable(row: BrainRow | null): AgentBrain | null {
    if (!row || row.enabled !== 1) return null;
    return parseBrainName(row.brain_key);
}

async function readKvBrain(env: Env, key: string): Promise<AgentBrain | null> {
    const parsed = parseBrainName(await env.XBOT_KV.get(key) ?? undefined);
    if (!parsed) return null;
    const row = await rowByKey(env, parsed);
    return usable(row);
}

export async function currentBrain(
    env: Env,
    message: IncomingMessage,
): Promise<{key: AgentBrain; layer: BrainLayer; displayName: string}> {
    const session = await readKvBrain(env, sessionKey(message));
    if (session) {
        const row = await rowByKey(env, session);
        return {key: session, layer: 'session', displayName: brainDisplayName(session, row?.display_name)};
    }
    const platform = await readKvBrain(env, platformKey(message.platform));
    if (platform) {
        const row = await rowByKey(env, platform);
        return {key: platform, layer: 'platform', displayName: brainDisplayName(platform, row?.display_name)};
    }
    const fallback = usable(await defaultRow(env)) ?? 'hermes';
    const row = await rowByKey(env, fallback);
    return {key: fallback, layer: 'default', displayName: brainDisplayName(fallback, row?.display_name)};
}

export async function resolveAgentBrain(env: Env, message: IncomingMessage): Promise<AgentBrain> {
    return (await currentBrain(env, message)).key;
}

export async function loadBrainConnection(env: Env, key: AgentBrain): Promise<BrainConnection> {
    const row = await rowByKey(env, key);
    const displayName = brainDisplayName(key, row?.display_name);
    if (key === 'hermes') {
        return {
            key,
            displayName,
            baseUrl: trimSlash(row?.base_url) || trimSlash(env.HERMES_BASE_URL),
            token: row?.token?.trim() || env.HERMES_TOKEN?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
            timeoutMs: row?.timeout_ms || timeoutOf(env.HERMES_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
            enabled: row ? row.enabled === 1 : true,
            appId: '',
            autoForward: true,
        };
    }
    if (key === 'qwenpaw') {
        return {
            key,
            displayName,
            baseUrl: trimSlash(row?.base_url) || trimSlash(env.QWENPAW_BASE_URL),
            token: row?.token?.trim() || env.QWENPAW_TOKEN?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
            timeoutMs: row?.timeout_ms || timeoutOf(env.QWENPAW_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
            enabled: row ? row.enabled === 1 : true,
            appId: '',
            autoForward: true,
        };
    }
    if (key === 'snailai') {
        return {
            key,
            displayName,
            baseUrl: trimSlash(row?.base_url) || trimSlash(env.SNAIL_AI_BASE_URL),
            token: row?.token?.trim() || env.SNAIL_AI_TOKEN?.trim() || '',
            timeoutMs: row?.timeout_ms || timeoutOf(env.SNAIL_AI_TIMEOUT_MS, 180_000),
            enabled: row ? row.enabled === 1 : true,
            appId: row?.app_id?.trim() || env.SNAIL_AI_APP_ID?.trim() || '',
            autoForward: true,
        };
    }
    return {
        key,
        displayName,
        baseUrl: trimSlash(row?.base_url) || openclawBase(env),
        token: row?.token?.trim() || env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim() || '',
        timeoutMs: row?.timeout_ms || timeoutOf(env.XBOT_CHANNEL_TIMEOUT_MS, 120_000),
        enabled: row ? row.enabled === 1 : true,
        appId: '',
        autoForward: row ? row.auto_forward === 1 : parseBool(env.XBOT_CHANNEL_AUTO_FORWARD, false),
    };
}

export async function brainStatus(env: Env, key: AgentBrain): Promise<'missing' | 'off' | 'ok'> {
    const row = await rowByKey(env, key);
    if (!row) return 'missing';
    return row.enabled === 1 ? 'ok' : 'off';
}

export async function setSessionBrain(env: Env, message: IncomingMessage, key: AgentBrain): Promise<void> {
    await env.XBOT_KV.put(sessionKey(message), key);
}

export async function setPlatformBrain(env: Env, platform: string, key: AgentBrain): Promise<void> {
    await env.XBOT_KV.put(platformKey(platform), key);
}

export async function clearSessionBrain(env: Env, message: IncomingMessage): Promise<void> {
    await env.XBOT_KV.delete(sessionKey(message));
}

export async function clearPlatformBrain(env: Env, platform: string): Promise<void> {
    await env.XBOT_KV.delete(platformKey(platform));
}

export async function setDefaultBrain(env: Env, key: AgentBrain): Promise<void> {
    await ensureSchema(env);
    await env.XBOT_DB.prepare(
        `UPDATE agent_brain
         SET is_default = CASE WHEN brain_key = ? THEN 1 ELSE 0 END,
             updated_at = ?`,
    ).bind(key, Date.now()).run();
}
