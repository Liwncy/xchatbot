/**
 * Hermes 大脑。门禁和口令已经在前面拦过，这里只把拼好的正文 POST 到频道 inbound。
 *
 * 切到这颗脑子：AGENT_BRAIN=hermes，并配 HERMES_BASE_URL。
 * Token 优先 HERMES_TOKEN，没有就复用 AGENT_BRIDGE_TOKEN。
 */
import {resolveAgentBrain} from '../../../core/brain.js';
import type {HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound, trimBaseUrl} from '../xbot-inbound.js';

function resolveTimeoutMs(env: {HERMES_TIMEOUT_MS?: string; XBOT_CHANNEL_TIMEOUT_MS?: string}): number {
    const raw = Number.parseInt(String(env.HERMES_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS ?? ''), 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 900_000) : 120_000;
}

export const hermesAgentPlugin: Plugin = {
    manifest: {
        name: 'hermes',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    match(message, ctx) {
        if (resolveAgentBrain(ctx.env) !== 'hermes') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const gatewayBaseUrl = trimBaseUrl(ctx.env.HERMES_BASE_URL);
        const token = ctx.env.HERMES_TOKEN?.trim()
            || ctx.env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim()
            || ctx.env.AGENT_BRIDGE_TOKEN?.trim();
        if (!gatewayBaseUrl || !token) {
            logger.warn('Hermes 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl,
            token,
            timeoutMs: resolveTimeoutMs(ctx.env),
            logLabel: 'Hermes',
        });
    },
};
