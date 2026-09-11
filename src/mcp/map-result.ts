import {textReply, type HandlerResponse} from '../core/reply.js';
import type {McpToolResult} from './client.js';

export function mapMcpResult(result: McpToolResult, fallback: string): HandlerResponse {
    const content = result.replyText?.trim() || result.text?.trim();
    if (content) return textReply(content);
    return textReply(fallback);
}
