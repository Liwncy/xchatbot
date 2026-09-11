import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {callMcpTool} from '../../../mcp/client.js';
import {mapMcpResult} from '../../../mcp/map-result.js';

const DEFAULT_MCP_URL = 'https://mcp.lwcfworker.dpdns.org/mcp';

function matchXiuxian(content: string): boolean {
    return content.trim().startsWith('修仙');
}

export const xiuxianCommandPlugin: Plugin = {
    manifest: {
        name: 'xiuxian',
        platforms: '*',
        kind: 'command',
        priority: 20,
        impl: 'mcp',
    },
    match(message) {
        return Boolean(message.content && matchXiuxian(message.content));
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const url = ctx.env.MCP_TOOLS_URL?.trim() || DEFAULT_MCP_URL;
        const platform = ctx.env.XIUXIAN_PLATFORM?.trim() || 'agbot';
        const text = message.content?.trim() ?? '';

        try {
            const result = await callMcpTool(url, {
                name: 'xiuxian_action',
                arguments: {
                    text,
                    platform,
                    userId: message.from,
                    userName: message.senderName,
                    requestId: `${message.platform}:${message.messageId}`,
                    listHelp: text === '修仙' || text === '修仙帮助',
                },
            }, {token: ctx.env.MCP_TOOLS_TOKEN});
            return mapMcpResult(result, '这招没使出来，等下再试');
        } catch {
            return textReply('修仙这边卡了一下，等下再试');
        }
    },
};
