import {KV_AGENT_BRIDGE_CONFIG} from '../../../constants/kv.js';
import type {Env} from '../../../types/env.js';
import type {AgentBridgeProvider, AgentBridgeRuntimeConfig} from './types.js';

const DEFAULT_MODEL = 'openclaw/default';
const DEFAULT_SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

interface PersistedAgentBridgeConfig {
    enabled?: boolean;
    provider?: string;
    baseUrl?: string;
    base_url?: string;
    token?: string;
    model?: string;
    sessionTtlSec?: number;
    session_ttl_sec?: number;
    requestTimeoutMs?: number;
    request_timeout_ms?: number;
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭', '禁用'].includes(normalized)) return false;
    return fallback;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
    const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value.trim(), 10) : Number.NaN;
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.floor(raw);
}

function normalizeProvider(value: unknown): AgentBridgeProvider {
    const normalized = normalizeOptionalString(typeof value === 'string' ? value : undefined)?.toLowerCase();
    if (normalized === 'openclaw') return 'openclaw';
    return 'openclaw';
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/u, '');
    if (trimmed.endsWith('/v1')) {
        return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/v1/chat/completions`;
}

function parsePersistedConfig(raw: string | null): PersistedAgentBridgeConfig | null {
    if (!raw?.trim()) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as PersistedAgentBridgeConfig;
    } catch {
        return null;
    }
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
    return normalizeChatCompletionsUrl(baseUrl);
}

export async function loadAgentBridgeRuntimeConfig(env: Env): Promise<AgentBridgeRuntimeConfig | null> {
    const persisted = parsePersistedConfig(await env.XBOT_KV.get(KV_AGENT_BRIDGE_CONFIG));
    const enabled = persisted?.enabled !== undefined
        ? normalizeBoolean(persisted.enabled, true)
        : normalizeBoolean(env.AGENT_BRIDGE_ENABLED, true);

    const baseUrl = normalizeOptionalString(persisted?.baseUrl ?? persisted?.base_url)
        ?? normalizeOptionalString(env.AGENT_BRIDGE_BASE_URL);
    const token = normalizeOptionalString(persisted?.token)
        ?? normalizeOptionalString(env.AGENT_BRIDGE_TOKEN);
    const model = normalizeOptionalString(persisted?.model)
        ?? normalizeOptionalString(env.AGENT_BRIDGE_MODEL)
        ?? DEFAULT_MODEL;

    if (!enabled || !baseUrl || !token) {
        return null;
    }

    return {
        enabled: true,
        provider: normalizeProvider(persisted?.provider),
        baseUrl,
        token,
        model,
        sessionTtlSec: normalizePositiveInt(
            persisted?.sessionTtlSec ?? persisted?.session_ttl_sec,
            DEFAULT_SESSION_TTL_SEC,
        ),
        requestTimeoutMs: normalizePositiveInt(
            persisted?.requestTimeoutMs ?? persisted?.request_timeout_ms ?? env.AGENT_BRIDGE_TIMEOUT_MS,
            DEFAULT_REQUEST_TIMEOUT_MS,
        ),
    };
}
