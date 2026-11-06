import {resolveBotId, resolveBotName} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import {callMcpTool, type McpToolResult} from '../../../mcp/client.js';
import type {Env} from '../../../types/env.js';
import {MCP_SERVERS} from '../../command/mcp-tools/catalog.js';
import {isBotMentioned} from '../session/mention.js';

/** 这条消息能不能交给监听器。挡掉口令、@ 机器人、机器人自己，以及非群聊非文字。 */
export function isAmbientCandidate(message: IncomingMessage, ctx: PluginContext): boolean {
    if (message.source !== 'group' || !message.chatId) return false;
    if (message.type !== 'text' || !message.content?.trim()) return false;

    const botId = resolveBotId(ctx.env, message.platform);
    if (botId && message.senderId.trim() === botId) return false;
    if (markedCommand(message, ctx.env) != null) return false;
    return !isBotMentioned(message, resolveBotName(ctx.env), botId);
}

/** 掷骰：percent 是 0～100 的百分比。 */
export function rollPercent(percent: number, random: () => number = Math.random): boolean {
    if (!(percent > 0)) return false;
    return random() * 100 < percent;
}

function endpoint(env: Env): {url: string; token?: string} | null {
    const def = MCP_SERVERS.cf;
    const url = (env as unknown as Record<string, string | undefined>)[def.urlEnv]?.trim() || def.fallbackUrl;
    if (!url) return null;
    const token = (env as unknown as Record<string, string | undefined>)[def.tokenEnv]?.trim();
    return token ? {url, token} : {url};
}

/**
 * 调自家 cf-mcp-tools 的工具，带超时。出错、超时都返回 null，监听器当没这回事。
 * 超时只是不再等，请求本身还在跑，所以要设得比服务端的模型超时略长。
 */
export async function callCfTool(
    env: Env,
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 15_000,
): Promise<McpToolResult | null> {
    const target = endpoint(env);
    if (!target) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            callMcpTool(target.url, {name, arguments: args}, {token: target.token}),
            new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), timeoutMs);
            }),
        ]);
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
