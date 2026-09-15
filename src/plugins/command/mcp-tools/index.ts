import {markedCommand} from '../../../core/command-mark.js';
import {isHandledReply, textReply, type HandlerResponse, type ReplyMessage} from '../../../core/reply.js';
import {mapMcpResult} from '../../../mcp/map-result.js';
import type {Plugin} from '../../runtime/types.js';
import {callCfMcp} from './call.js';
import {mapRuleExecute} from './map-rule.js';
import {matchXuanxueCommand, xuanxueText} from './xuanxue-keywords.js';

function matchManor(command: string): boolean {
    return command.startsWith('庄园');
}

function rewriteManorHelp(response: HandlerResponse): HandlerResponse {
    if (!response || isHandledReply(response)) return response;
    const rewrite = (item: ReplyMessage): ReplyMessage => {
        if (item.type !== 'text') return item;
        return textReply(item.content.replaceAll('「庄园帮助」', '「#庄园帮助」'));
    };
    if (Array.isArray(response)) return response.map(rewrite);
    return rewrite(response);
}

export const mcpToolsCommandPlugin: Plugin = {
    manifest: {
        name: 'mcp-tools',
        platforms: '*',
        kind: 'command',
        priority: 25,
        impl: 'mcp',
    },
    match(message, ctx) {
        const command = markedCommand(message, ctx.env);
        return Boolean(command);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = markedCommand(message, ctx.env)?.trim() ?? '';
        if (!command) return null;
        const platform = ctx.env.XIUXIAN_PLATFORM?.trim() || 'agbot';

        try {
            if (matchManor(command)) {
                const result = await callCfMcp(ctx.env, 'manor_action', {
                    text: command,
                    platform,
                    userId: message.from,
                    userName: message.senderName,
                    requestId: `${message.platform}:${message.messageId}`,
                    listHelp: command === '庄园' || command === '庄园帮助',
                });
                return rewriteManorHelp(mapMcpResult(result, '庄园这边卡了一下，等下再试'));
            }

            if (matchXuanxueCommand(command)) {
                const result = await callCfMcp(ctx.env, 'xuanxue_query', {
                    text: xuanxueText(command),
                    listHelp: command === '玄学' || command === '玄学帮助' || command === '玄学指令',
                });
                if (!result.ok && (result.text ?? '').includes('未匹配到玄学指令')) return null;
                return mapMcpResult(result, '这次没算出，再试下');
            }

            const result = await callCfMcp(ctx.env, 'rule_execute', {
                content: command,
                context: {
                    from: message.from,
                    senderName: message.senderName ?? '',
                    messageId: message.messageId,
                    roomId: message.room?.id ?? '',
                },
            });
            return mapRuleExecute(result);
        } catch {
            if (matchManor(command)) return textReply('庄园这边卡了一下，等下再试');
            if (matchXuanxueCommand(command)) return textReply('这次没算出，再试下');
            return textReply('这次没弄成，再试下');
        }
    },
};
