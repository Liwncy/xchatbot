import type {PluginContext} from '../../../core/context.js';
import {peerCollectInbound} from '../../../core/peer-roster/index.js';
import type {HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';

export const peerCollectPlugin: Plugin = {
    manifest: {
        name: 'peer-collect',
        platforms: '*',
        kind: 'channel',
        priority: 2,
        impl: 'local',
    },
    match(message) {
        return message.source === 'group' && Boolean(message.room?.id?.trim() && message.from.trim());
    },
    async handle(message, ctx: PluginContext): Promise<HandlerResponse> {
        ctx.waitUntil((async () => {
            try {
                await peerCollectInbound(ctx.env, message);
            } catch (error) {
                logger.warn('花名册没收下', {
                    messageId: message.messageId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })());
        return null;
    },
};
