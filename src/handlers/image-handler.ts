import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle image messages.
 * Replace with your own business logic (e.g., image recognition, OCR).
 */
export async function handleImageMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage> {
  return {
    type: 'text',
    content: '收到您发送的图片，暂时无法处理图片消息。',
  };
}
