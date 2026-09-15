import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import {mapMcpResult} from '../../../mcp/map-result.js';
import type {Plugin} from '../../runtime/types.js';
import {callCfMcp} from '../mcp-tools/call.js';

function matchXiuxian(command: string): boolean {
    return command.startsWith('修仙');
}

export const xiuxianCommandPlugin: Plugin = {
    manifest: {
        name: 'xiuxian',
        platforms: '*',
        kind: 'command',
        priority: 20,
        impl: 'mcp',
    },
    match(message, ctx) {
        const command = markedCommand(message, ctx.env);
        return command != null && matchXiuxian(command);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const platform = ctx.env.XIUXIAN_PLATFORM?.trim() || 'agbot';
        const text = markedCommand(message, ctx.env) ?? '';

        try {
            const result = await callCfMcp(ctx.env, 'xiuxian_action', {
                text,
                platform,
                userId: message.from,
                userName: message.senderName,
                requestId: `${message.platform}:${message.messageId}`,
                listHelp: text === '修仙' || text === '修仙帮助',
            });
            return mapMcpResult(result, '这招没使出来，等下再试');
        } catch {
            return textReply('修仙这边卡了一下，等下再试');
        }
    },
};
