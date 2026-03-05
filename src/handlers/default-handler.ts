import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Default fallback handler for unrecognized message types.
 */
export async function handleDefault(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage> {
  return {
    type: 'text',
    content: '暂不支持该类型的消息。',
  };
}
