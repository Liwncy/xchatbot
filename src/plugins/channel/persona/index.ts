import {markedCommand} from '../../../core/command-mark.js';
import {tryHandlePersona} from '../../../core/persona/index.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';

export const personaPlugin: Plugin = {
    manifest: {
        name: 'persona',
        platforms: '*',
        kind: 'channel',
        priority: 6,
        impl: 'local',
    },
    match(message, ctx) {
        return message.source === 'private' && markedCommand(message, ctx.env) != null;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = markedCommand(message, ctx.env);
        if (command == null) return null;
        const reply = await tryHandlePersona(ctx.env, message, command);
        return reply ? textReply(reply) : null;
    },
};
