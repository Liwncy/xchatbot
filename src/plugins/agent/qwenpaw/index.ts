/**
 * QwenPaw 大脑。门禁和口令已经在前面拦过，这里只把拼好的正文 POST 到频道 inbound。
 *
 * 切到这颗脑子：AGENT_BRAIN=qwenpaw，并配 QWENPAW_BASE_URL。
 * Token 优先 QWENPAW_TOKEN，没有就复用 AGENT_BRIDGE_TOKEN。
 */
import {resolveAgentBrain} from '../../../core/brain.js';
import type {HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound, trimBaseUrl} from '../xbot-inbound.js';

function resolveTimeoutMs(env: {QWENPAW_TIMEOUT_MS?: string; XBOT_CHANNEL_TIMEOUT_MS?: string}): number {
    const raw = Number.parseInt(String(env.QWENPAW_TIMEOUT_MS ?? env.XBOT_CHANNEL_TIMEOUT_MS ?? ''), 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 900_000) : 120_000;
}

export const qwenpawAgentPlugin: Plugin = {
    manifest: {
        name: 'qwenpaw',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    match(message, ctx) {
        if (resolveAgentBrain(ctx.env) !== 'qwenpaw') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const gatewayBaseUrl = trimBaseUrl(ctx.env.QWENPAW_BASE_URL);
        const token = ctx.env.QWENPAW_TOKEN?.trim()
            || ctx.env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim()
            || ctx.env.AGENT_BRIDGE_TOKEN?.trim();
        if (!gatewayBaseUrl || !token) {
            logger.warn('QwenPaw 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl,
            token,
            timeoutMs: resolveTimeoutMs(ctx.env),
            extraHeaders: {'x-qwenpaw-runtime-token': token},
            logLabel: 'QwenPaw',
        });
    },
};
