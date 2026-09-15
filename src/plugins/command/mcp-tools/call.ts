import {callMcpTool, type McpToolResult} from '../../../mcp/client.js';
import type {Env} from '../../../types/env.js';

export const DEFAULT_MCP_URL = 'https://mcp.lwcfworker.dpdns.org/mcp';

export function mcpToolsUrl(env: Env): string {
    return env.MCP_TOOLS_URL?.trim() || DEFAULT_MCP_URL;
}

export async function callCfMcp(
    env: Env,
    name: string,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    return callMcpTool(mcpToolsUrl(env), {
        name,
        arguments: args,
    }, {token: env.MCP_TOOLS_TOKEN});
}
