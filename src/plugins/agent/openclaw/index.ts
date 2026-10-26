import {currentBrain} from '../../../core/brain-store.js';
import {type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound} from '../xbot-inbound.js';

export const openclawAgentPlugin: Plugin = {
    manifest: {
        name: 'openclaw',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    async match(message, ctx) {
        const current = await currentBrain(ctx.env, message);
        if (current.kind !== 'openclaw') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!current.enabled || !current.autoForward) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const current = await currentBrain(ctx.env, message);
        if (current.kind !== 'openclaw' || !current.baseUrl || !current.token) {
            logger.warn('OpenClaw 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl: current.baseUrl,
            token: current.token,
            timeoutMs: current.timeoutMs,
            logLabel: 'OpenClaw',
        });
    },
};
