import type {IncomingMessage, ReplyMessage, MessageHandler, HandlerResponse, Env} from '../types/message.js';
import {handleTextMessage} from '../handlers/text-handler.js';
import {handleImageMessage} from '../handlers/image-handler.js';
import {handleVoiceMessage} from '../handlers/voice-handler.js';
import {handleVideoMessage} from '../handlers/video-handler.js';
import {handleLocationMessage} from '../handlers/location-handler.js';
import {handleLinkMessage} from '../handlers/link-handler.js';
import {handleEventMessage} from '../handlers/event-handler.js';
import {handleDefault} from '../handlers/default-handler.js';

/**
 * 按消息类型注册的处理器映射表。
 * 在此添加或替换处理器以自定义行为。
 */
const handlerRegistry: Record<string, MessageHandler> = {
    text: handleTextMessage,
    image: handleImageMessage,
    voice: handleVoiceMessage,
    video: handleVideoMessage,
    location: handleLocationMessage,
    link: handleLinkMessage,
    event: handleEventMessage as MessageHandler,
};

/**
 * 将标准化后的消息路由到对应的处理器。
 * 返回回复消息，或返回 null 表示不需要回复。
 */
export async function routeMessage(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const handler = handlerRegistry[message.type] ?? handleDefault;
    return handler(message, env);
}

/**
 * 将 {@link HandlerResponse} 标准化为扁平的回复数组。
 * 当响应为 `null` 时返回空数组。
 */
export function toReplyArray(response: HandlerResponse): ReplyMessage[] {
    if (!response) return [];
    return Array.isArray(response) ? response : [response];
}

/**
 * 注册自定义消息处理器。
 * 可在不修改本文件的情况下扩展路由。
 */
export function registerHandler(type: string, handler: MessageHandler): void {
    handlerRegistry[type] = handler;
}
