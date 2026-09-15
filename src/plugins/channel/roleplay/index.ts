import {resolveBotId, resolveBotName, stripBotPrefix} from '../../../core/bot.js';
import type {IncomingMessage} from '../../../core/message.js';
import {tryHandleRoleplay} from '../../../core/roleplay/index.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';

function commandOf(message: IncomingMessage, botName?: string, botId?: string): string {
    return stripBotPrefix(message.content?.trim() ?? '', botName, botId);
}

export const roleplayPlugin: Plugin = {
    manifest: {
        name: 'roleplay',
        platforms: '*',
        kind: 'channel',
        priority: 6,
        impl: 'local',
    },
    match(message) {
        return message.source === 'private' && message.type === 'text';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const reply = await tryHandleRoleplay(
            ctx.env,
            message,
            commandOf(message, resolveBotName(ctx.env), resolveBotId(ctx.env, message.platform)),
        );
        return reply ? textReply(reply) : null;
    },
};
