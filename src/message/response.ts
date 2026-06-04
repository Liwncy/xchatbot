import type {HandlerResponse, ReplyMessage} from '../types/reply.js';

/**
 * 将 {@link HandlerResponse} 标准化为扁平的回复数组。
 * 当响应为 `null` 时返回空数组。
 */
export function toReplyArray(response: HandlerResponse): ReplyMessage[] {
    if (!response) return [];
    return Array.isArray(response) ? response : [response];
}

