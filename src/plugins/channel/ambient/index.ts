import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import {loadDisabledNames} from '../../runtime/index.js';
import type {Plugin} from '../../runtime/types.js';
import {isAmbientCandidate} from './guard.js';
import {listAmbientListeners} from './registry.js';

/**
 * 群聊旁听宿主。普通群消息（不是口令、没 @ 机器人）里，让各玩法的监听器有机会插一句话。
 *
 * 优先级排在 group-session（5）前面，因为 group-session 会把没放行的群消息直接吞掉，
 * 排在后面就永远看不到这些消息。不用改 group-session。
 *
 * 监听器由各玩法在 plugins/register.ts 里用 registerAmbientListener 登记，按登记顺序问，
 * 第一个回了话的赢；都不回就返回 null，消息照常往下走。宿主自己不认识任何玩法。
 * 回了话的那条消息不会再交给大脑。
 */
export const ambientPlugin: Plugin = {
    manifest: {
        name: 'ambient',
        platforms: '*',
        kind: 'channel',
        priority: 4,
        impl: 'local',
    },
    match(message, ctx) {
        return listAmbientListeners().length > 0 && isAmbientCandidate(message, ctx);
    },
    async handle(message: IncomingMessage, ctx: PluginContext): Promise<HandlerResponse> {
        let disabled: Set<string> | null = null;
        for (const listener of listAmbientListeners()) {
            try {
                if (!await listener.match(message, ctx)) continue;
                // 停用清单要读一次 KV，等有监听器预判命中了再读，别让每条群消息都多一次。
                disabled ??= await loadDisabledNames(ctx.env);
                if (disabled.has(`ambient:${listener.name}`)) continue;

                const response = await listener.handle(message, ctx);
                if (response === null) continue;
                logger.info('旁听命中', {listener: listener.name, messageId: message.messageId});
                return response;
            } catch (error) {
                logger.warn('旁听监听器出错', {
                    listener: listener.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return null;
    },
};
