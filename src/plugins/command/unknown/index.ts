import {textReply, type HandlerResponse} from '../../../core/reply.js';
import {markedCommand} from '../../../core/command-mark.js';
import type {Plugin} from '../../runtime/types.js';

export const unknownCommandPlugin: Plugin = {
    manifest: {
        name: 'unknown-command',
        platforms: '*',
        kind: 'command',
        priority: 90,
        impl: 'local',
    },
    match(message, ctx) {
        return markedCommand(message, ctx.env) != null;
    },
    async handle(): Promise<HandlerResponse> {
        return textReply('没听懂 🤔');
    },
};
