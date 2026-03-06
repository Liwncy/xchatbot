import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';
import { pluginManager } from '../plugins/index.js';

/**
 * Handle text messages.
 * Checks registered plugins first, then falls back to built-in keyword routing.
 */
export async function handleTextMessage(
  message: IncomingMessage,
  env: Env,
): Promise<ReplyMessage> {
  const trimmed = (message.content ?? '').trim();

  // Check plugins first — the first matching plugin wins
  const plugin = pluginManager.findPlugin(message);
  if (plugin) {
    const result = await plugin.handle(message, env);
    if (result) return result;
  }

  const content = trimmed.toLowerCase();

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
    type: 'unknown',
    content: `收到您的消息：${message.content ?? ''}`,
  };
}
