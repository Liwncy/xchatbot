import type { IncomingMessage, ReplyMessage, MessageHandler, Env } from '../types/message.js';
import { handleTextMessage } from '../handlers/text-handler.js';
import { handleImageMessage } from '../handlers/image-handler.js';
import { handleVoiceMessage } from '../handlers/voice-handler.js';
import { handleVideoMessage } from '../handlers/video-handler.js';
import { handleLocationMessage } from '../handlers/location-handler.js';
import { handleLinkMessage } from '../handlers/link-handler.js';
import { handleEventMessage } from '../handlers/event-handler.js';
import { handleDefault } from '../handlers/default-handler.js';

/**
 * Registry of message handlers keyed by message type.
 * Add or replace handlers here to customize behavior.
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
 * Route an incoming normalized message to the appropriate handler.
 * Returns the reply message, or null if no reply should be sent.
 */
export async function routeMessage(
  message: IncomingMessage,
  env: Env,
): Promise<ReplyMessage | null> {
  const handler = handlerRegistry[message.type] ?? handleDefault;
  return handler(message, env);
}

/**
 * Register a custom handler for a message type.
 * Useful for extending the router without modifying this file.
 */
export function registerHandler(type: string, handler: MessageHandler): void {
  handlerRegistry[type] = handler;
}
