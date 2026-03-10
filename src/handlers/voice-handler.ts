import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle voice messages.
 * Replace with your own business logic (e.g., speech-to-text).
 */
export async function handleVoiceMessage(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage | null> {
  console.log('收到语音消息，但暂时无法处理。');
  return null;
}
