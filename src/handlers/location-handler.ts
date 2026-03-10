import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';
import { logger } from '../utils/logger.js';

/**
 * 处理位置消息。
 * 可替换为自定义业务逻辑（如附近服务查询等）。
 */
export async function handleLocationMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  const loc = message.location;
  if (!loc) {
    return { type: 'text', content: '收到位置信息，但解析失败。' };
  }
  logger.info(`收到位置消息：纬度=${loc.latitude} 经度=${loc.longitude}` +
      (loc.label ? ` 地址=${loc.label}` : ''));
  return null;
}
