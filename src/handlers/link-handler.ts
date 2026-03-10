import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle link messages.
 * Replace with your own business logic.
 */
export async function handleLinkMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage | null> {
  const link = message.link;
  if (!link) {
    return { type: 'text', content: '收到链接消息，但解析失败。' };
  }
  console.log(`收到链接：${link.title}\n${link.url}`)
  return null;
}
