const DEFAULT_CLIENT_ID = 'xchatbot-worker';

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭', '禁用'].includes(normalized)) return false;
    return fallback;
}

/** 将 OpenAI 兼容根地址还原为 Gateway HTTP 根地址。 */
export function resolveOpenClawGatewayBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/u, '');
    if (trimmed.endsWith('/v1')) {
        return trimmed.slice(0, -3);
    }
    return trimmed;
}

export function resolveXbotChannelClientId(env: {
    XBOT_CHANNEL_CLIENT_ID?: string;
}): string {
    return normalizeOptionalString(env.XBOT_CHANNEL_CLIENT_ID) ?? DEFAULT_CLIENT_ID;
}

export interface XbotChannelRuntimeConfig {
    enabled: true;
    gatewayBaseUrl: string;
    gatewayToken: string;
    clientId: string;
    requestTimeoutMs: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export type XbotChannelConfigState =
    | {state: 'disabled'}
    | {state: 'ready'; config: XbotChannelRuntimeConfig}
    | {state: 'misconfigured'; reasons: string[]};

export function resolveXbotChannelConfigState(env: {
    XBOT_CHANNEL_ENABLED?: string;
    XBOT_CHANNEL_GATEWAY_URL?: string;
    XBOT_CHANNEL_GATEWAY_TOKEN?: string;
    XBOT_CHANNEL_CLIENT_ID?: string;
    AGENT_BRIDGE_BASE_URL?: string;
    AGENT_BRIDGE_TOKEN?: string;
    XBOT_CHANNEL_TIMEOUT_MS?: string;
}): XbotChannelConfigState {
    const enabled = normalizeBoolean(env.XBOT_CHANNEL_ENABLED, false);
    if (!enabled) {
        return {state: 'disabled'};
    }

    const reasons: string[] = [];
    const bridgeBaseUrl = normalizeOptionalString(env.AGENT_BRIDGE_BASE_URL);
    const gatewayBaseUrl = normalizeOptionalString(env.XBOT_CHANNEL_GATEWAY_URL)
        ?? (bridgeBaseUrl ? resolveOpenClawGatewayBaseUrl(bridgeBaseUrl) : undefined);
    const gatewayToken = normalizeOptionalString(env.XBOT_CHANNEL_GATEWAY_TOKEN)
        ?? normalizeOptionalString(env.AGENT_BRIDGE_TOKEN);

    if (!gatewayBaseUrl) {
        reasons.push('缺少 XBOT_CHANNEL_GATEWAY_URL 或 AGENT_BRIDGE_BASE_URL');
    }
    if (!gatewayToken) {
        reasons.push('缺少 XBOT_CHANNEL_GATEWAY_TOKEN 或 AGENT_BRIDGE_TOKEN（wrangler secret）');
    }
    if (reasons.length > 0) {
        return {state: 'misconfigured', reasons};
    }

    const timeoutRaw = Number.parseInt(String(env.XBOT_CHANNEL_TIMEOUT_MS ?? '').trim(), 10);
    const requestTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? Math.min(timeoutRaw, 900_000)
        : DEFAULT_REQUEST_TIMEOUT_MS;

    return {
        state: 'ready',
        config: {
            enabled: true,
            gatewayBaseUrl: gatewayBaseUrl!,
            gatewayToken: gatewayToken!,
            clientId: resolveXbotChannelClientId(env),
            requestTimeoutMs,
        },
    };
}

export function loadXbotChannelRuntimeConfig(env: {
    XBOT_CHANNEL_ENABLED?: string;
    XBOT_CHANNEL_GATEWAY_URL?: string;
    XBOT_CHANNEL_GATEWAY_TOKEN?: string;
    XBOT_CHANNEL_CLIENT_ID?: string;
    AGENT_BRIDGE_BASE_URL?: string;
    AGENT_BRIDGE_TOKEN?: string;
    XBOT_CHANNEL_TIMEOUT_MS?: string;
}): XbotChannelRuntimeConfig | null {
    const state = resolveXbotChannelConfigState(env);
    return state.state === 'ready' ? state.config : null;
}
