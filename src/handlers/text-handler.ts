import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * Handle text messages.
 * Implements basic keyword-based routing as a starting point.
 * Replace or extend this handler with your own business logic.
 */
export async function handleTextMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<ReplyMessage> {
  const content = (message.content ?? '').trim().toLowerCase();

  if (content === 'help' || content === '帮助') {
    return {
      type: 'text',
      content:
        '您好！我是消息处理机器人。\n' +
        '目前支持以下命令：\n' +
        '【帮助】显示帮助信息\n' +
        '【关于】关于本机器人',
    };
  }

  if (content === 'about' || content === '关于') {
    return {
      type: 'text',
      content: '本机器人基于 Cloudflare Workers 构建，支持多平台消息处理。',
    };
  }

  // Default echo reply — replace with your own logic
  return {
    type: 'text',
    content: `收到您的消息：${message.content ?? ''}`,
  };
}
