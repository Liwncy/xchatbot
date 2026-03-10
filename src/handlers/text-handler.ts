import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';
import { pluginManager } from '../plugins/index.js';
import { logger } from '../utils/logger.js';

/**
 * 处理文本消息。
 * 优先检查已注册的插件，未匹配时走内置关键词路由。
 */
export async function handleTextMessage(
  message: IncomingMessage,
  env: Env,
): Promise<HandlerResponse> {
  const trimmed = (message.content ?? '').trim();

  // 优先检查插件 —— 第一个匹配的插件生效
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

  // 默认不回复 —— 仅记录日志
  logger.info(`收到文本消息：${message.content ?? ''}`);
  return null;
}
