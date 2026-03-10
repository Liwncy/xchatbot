import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/**
 * Handle location messages.
 * Replace with your own business logic (e.g., nearby services).
 */
export async function handleLocationMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  const loc = message.location;
  if (!loc) {
    return { type: 'text', content: '收到位置信息，但解析失败。' };
  }
  console.log(`收到您的位置信息：\n` +
      `纬度：${loc?.latitude}\n` +
      `经度：${loc?.longitude}` +
      (loc?.label ? `\n地址：${loc?.label}` : ''))
  return null;
}
