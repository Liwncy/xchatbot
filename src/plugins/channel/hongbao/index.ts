import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import {handledReply, type HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';
import {thanksReply} from './thanks.js';

export const hongbaoPlugin: Plugin = {
    manifest: {
        name: 'hongbao',
        platforms: '*',
        kind: 'channel',
        priority: 3,
        impl: 'local',
    },
    match(message, ctx) {
        return message.type === 'hongbao'
            && Boolean(message.hongbao?.nativeUrl)
            && Boolean(ctx.adapter?.claimHongbao);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        return grabInboundHongbao(message, ctx);
    },
};

async function grabInboundHongbao(message: IncomingMessage, ctx: PluginContext): Promise<HandlerResponse> {
    const nativeUrl = message.hongbao?.nativeUrl?.trim() ?? '';
    const claim = ctx.adapter?.claimHongbao;
    if (!nativeUrl || !claim) return handledReply();

    const scene = message.source === 'group' ? 'group' : 'private';
    try {
        const result = await claim(nativeUrl, scene, ctx.env);
        if (result.ok) {
            logger.info('红包领到了', {
                scene,
                amountFen: result.amountFen ?? 0,
                messageId: message.messageId,
            });
            if (scene === 'group') return thanksReply(message);
        } else {
            logger.info('红包没领成', {
                scene,
                reason: result.reason ?? 'failed',
                messageId: message.messageId,
            });
        }
    } catch (error) {
        logger.warn('红包领取失败', {
            messageId: message.messageId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return handledReply();
}
