import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle image messages.
 * Replace with your own business logic (e.g., image recognition, OCR).
 */
export async function handleImageMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage | null> {
  console.log('收到图片消息，但暂时无法处理。');
  return null;
}
