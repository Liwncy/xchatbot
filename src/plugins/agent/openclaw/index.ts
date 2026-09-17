import {resolveAgentBrain} from '../../../core/brain.js';
import {type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound, trimBaseUrl} from '../xbot-inbound.js';

function resolveGatewayBaseUrl(env: {
    XBOT_CHANNEL_GATEWAY_URL?: string;
    AGENT_BRIDGE_BASE_URL?: string;
}): string | undefined {
    const explicit = trimBaseUrl(env.XBOT_CHANNEL_GATEWAY_URL);
    if (explicit) return explicit;
    const bridge = trimBaseUrl(env.AGENT_BRIDGE_BASE_URL);
    if (!bridge) return undefined;
    return bridge.endsWith('/v1') ? bridge.slice(0, -3) : bridge;
}

function resolveTimeoutMs(env: {XBOT_CHANNEL_TIMEOUT_MS?: string}): number {
    const timeoutRaw = Number.parseInt(String(env.XBOT_CHANNEL_TIMEOUT_MS ?? ''), 10);
    return Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? Math.min(timeoutRaw, 900_000)
        : 120_000;
}

export const openclawAgentPlugin: Plugin = {
    manifest: {
        name: 'openclaw',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    match(message, ctx) {
        if (resolveAgentBrain(ctx.env) !== 'openclaw') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_AUTO_FORWARD, false)) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const gatewayBaseUrl = resolveGatewayBaseUrl(ctx.env);
        const token = ctx.env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim()
            || ctx.env.AGENT_BRIDGE_TOKEN?.trim();
        if (!gatewayBaseUrl || !token) {
            logger.warn('OpenClaw 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl,
            token,
            timeoutMs: resolveTimeoutMs(ctx.env),
            logLabel: 'OpenClaw',
        });
    },
};
