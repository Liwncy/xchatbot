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

  // 依次执行所有命中的插件，直到某个插件返回有效结果
  const plugins = pluginManager.findPlugins(message);
  for (const plugin of plugins) {
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

  // 未匹配到插件或关键词 —— 仅记录日志，不回复
  logger.info(`收到文本消息：${message.content ?? ''}`);
  return null;
}
