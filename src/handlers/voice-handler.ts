import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle voice messages.
 * Replace with your own business logic (e.g., speech-to-text).
 */
export async function handleVoiceMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage> {
  return {
    type: 'text',
    content: '收到您发送的语音消息，暂时无法处理语音消息。',
  };
}
