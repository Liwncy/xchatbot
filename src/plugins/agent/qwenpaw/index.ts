/**
 * QwenPaw 大脑。门禁和口令已经在前面拦过，这里只把拼好的正文 POST 到频道 inbound。
 *
 * 切到这颗脑子用 `#脑子`。地址和 token 在 D1，空则回退环境变量。
 */
import {loadBrainConnection, resolveAgentBrain} from '../../../core/brain-store.js';
import type {HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound} from '../xbot-inbound.js';

export const qwenpawAgentPlugin: Plugin = {
    manifest: {
        name: 'qwenpaw',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    async match(message, ctx) {
        if (await resolveAgentBrain(ctx.env, message) !== 'qwenpaw') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        const connection = await loadBrainConnection(ctx.env, 'qwenpaw');
        if (!connection.enabled) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const connection = await loadBrainConnection(ctx.env, 'qwenpaw');
        if (!connection.baseUrl || !connection.token) {
            logger.warn('QwenPaw 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl: connection.baseUrl,
            token: connection.token,
            timeoutMs: connection.timeoutMs,
            extraHeaders: {'x-qwenpaw-runtime-token': connection.token},
            logLabel: 'QwenPaw',
        });
    },
};
