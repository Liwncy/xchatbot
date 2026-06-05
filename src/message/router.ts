import type {IncomingMessage} from '../types/message.js';
import type {MessageHandler} from '../types/plugin.js';
import type {Env} from '../types/env.js';
import type {HandlerResponse} from '../types/reply.js';
import {handleTextMessage} from './handlers/text.js';
import {handleImageMessage} from './handlers/image.js';
import {handleVoiceMessage} from './handlers/voice.js';
import {handleVideoMessage} from './handlers/video.js';
import {handleLocationMessage} from './handlers/location.js';
import {handleLinkMessage} from './handlers/link.js';
import {handleEventMessage} from './handlers/event.js';
import {handleDefault} from './handlers/default.js';

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
 * 注册自定义消息处理器。
 * 可在不修改本文件的情况下扩展路由。
 */
export function registerHandler(type: string, handler: MessageHandler): void {
    handlerRegistry[type] = handler;
}

