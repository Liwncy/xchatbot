import type {PluginContext} from '../../../core/context.js';
import {emojiCollectInbound, emojiRelabelPlaceholders} from '../../../core/emoji-stash/index.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';

function collectableMd5(message: IncomingMessage): string | undefined {
    const md5 = message.media?.md5?.trim().toLowerCase();
    return md5 && /^[0-9a-f]{32}$/.test(md5) ? md5 : undefined;
}

export const emojiCollectPlugin: Plugin = {
    manifest: {
        name: 'emoji-collect',
        platforms: '*',
        kind: 'channel',
        priority: 2,
        impl: 'local',
    },
    match(message) {
        return message.type === 'emoji' && Boolean(collectableMd5(message));
    },
    async handle(message, ctx: PluginContext): Promise<HandlerResponse> {
        const md5 = collectableMd5(message);
        if (!md5) return null;
        const imgUrl = message.media?.publicUrl || message.media?.url;
        const source = message.source === 'group'
            ? `group:${message.room?.id ?? ''}`
            : `user:${message.from}`;
        ctx.waitUntil((async () => {
            try {
                await emojiCollectInbound(ctx.env, {md5, imgUrl, source});
            } catch (error) {
                logger.warn('表情没收下', {
                    messageId: message.messageId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            try {
                await emojiRelabelPlaceholders(ctx.env, {limit: 12, llmLimit: 1});
            } catch (error) {
                logger.warn('旧表情没重标上', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        })());
        return null;
    },
};
