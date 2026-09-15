/**
 * `#` 快捷口令插件。带 `#`/`＃` 的消息走这里，不进大脑。
 *
 * 加工具：改 catalog.ts。
 * 对不上规则库时返回 null，由 unknown 插件回「没听懂」。
 */
import {markedCommand} from '../../../core/command-mark.js';
import type {HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {dispatchMcpCommand} from './dispatch.js';

export const mcpToolsCommandPlugin: Plugin = {
    manifest: {
        name: 'mcp-tools',
        platforms: '*',
        kind: 'command',
        priority: 20,
        impl: 'mcp',
    },
    match(message, ctx) {
        return Boolean(markedCommand(message, ctx.env));
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = markedCommand(message, ctx.env)?.trim() ?? '';
        if (!command) return null;
        return dispatchMcpCommand(command, message, ctx.env);
    },
};
