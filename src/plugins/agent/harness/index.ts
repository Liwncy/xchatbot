/**
 * Harness 大脑（DeepSeek Harness / dsh）。门禁和口令已经在前面拦过，这里只把拼好的正文 POST 到频道 inbound。
 *
 * 切到这颗脑子用 `#脑子`。地址和 token 在 D1，空则回退环境变量。
 */
import {currentBrain} from '../../../core/brain-store.js';
import type {HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {forwardXbotInbound} from '../xbot-inbound.js';

export const harnessAgentPlugin: Plugin = {
    manifest: {
        name: 'harness',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    async match(message, ctx) {
        const current = await currentBrain(ctx.env, message);
        if (current.kind !== 'harness') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!current.enabled) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const current = await currentBrain(ctx.env, message);
        const viaMailbox = current.transport === 'ws';
        const canDirect = Boolean(current.baseUrl && current.token);
        // ws 模式下可以没有直推地址：Harness 自己连上来就行
        if (current.kind !== 'harness' || (!viaMailbox && !canDirect)) {
            logger.warn('Harness 未配齐，跳过');
            return null;
        }
        return forwardXbotInbound({
            message,
            env: ctx.env,
            gatewayBaseUrl: current.baseUrl,
            token: current.token,
            timeoutMs: current.timeoutMs,
            logLabel: 'Harness',
            ...(viaMailbox ? {mailboxBrainKey: current.key} : {}),
        });
    },
};
