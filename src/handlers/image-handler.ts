import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/**
 * Handle image messages.
 * Replace with your own business logic (e.g., image recognition, OCR).
 */
export async function handleImageMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  console.log('收到图片消息，但暂时无法处理。');
  return null;
}
