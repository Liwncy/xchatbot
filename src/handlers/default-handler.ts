import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Default fallback handler for unrecognized message types.
 */
export async function handleDefault(
  _message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage | null> {
  console.log(`收到不支持的消息类型：${_message.type}`)
  return null;
}
