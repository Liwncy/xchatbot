import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';
import { logger } from '../utils/logger.js';

/**
 * 处理链接消息。
 * 可替换为自定义业务逻辑。
 */
export async function handleLinkMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  const link = message.link;
  if (!link) {
    return { type: 'text', content: '收到链接消息，但解析失败。' };
  }
  logger.info(`收到链接消息：${link.title} ${link.url}`);
  return null;
}
