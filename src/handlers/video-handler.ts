import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/**
 * Handle video messages.
 * Replace with your own business logic.
 */
export async function handleVideoMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  console.log('收到视频消息，但暂时无法处理。');
  return null;
}
