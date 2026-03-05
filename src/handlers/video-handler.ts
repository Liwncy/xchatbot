import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle video messages.
 * Replace with your own business logic.
 */
export async function handleVideoMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage> {
  return {
    type: 'text',
    content: '收到您发送的视频消息，暂时无法处理视频消息。',
  };
}
