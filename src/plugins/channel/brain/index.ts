import {tryHandleBrain} from '../../../core/brain-command.js';
import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';

function isBrainCommand(command: string): boolean {
    return command === '脑子' || command.startsWith('脑子 ') || command.startsWith('脑子　');
}

export const brainPlugin: Plugin = {
    manifest: {
        name: 'brain',
        platforms: '*',
        kind: 'channel',
        priority: 7,
        impl: 'local',
    },
    match(message, ctx) {
        const command = markedCommand(message, ctx.env);
        if (command == null) return false;
        if (message.source !== 'private' && message.source !== 'group') return false;
        return isBrainCommand(command);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = markedCommand(message, ctx.env);
        if (command == null) return null;
        const reply = await tryHandleBrain(ctx.env, message, command);
        return reply ? textReply(reply) : null;
    },
};
