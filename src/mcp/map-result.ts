import {parseRepliesFromText} from '../core/outbound.js';
import {textReply, type HandlerResponse} from '../core/reply.js';
import type {McpToolResult} from './client.js';

export function mapMcpResult(result: McpToolResult, fallback: string): HandlerResponse {
    const content = result.replyText?.trim() || result.text?.trim();
    if (!content) return textReply(fallback);
    const replies = parseRepliesFromText(content);
    return replies.length > 0 ? replies : textReply(fallback);
}
