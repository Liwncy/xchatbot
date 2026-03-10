import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/**
 * Handle event messages (subscribe, unsubscribe, SCAN, etc.).
 * Customize each event type with your own business logic.
 */
export async function handleEventMessage(
  message: IncomingMessage,
  _env: Env,
): Promise<HandlerResponse> {
  const eventType = message.event?.type;

  switch (eventType) {
    case 'subscribe':
      return {
        type: 'text',
        content: '感谢您的关注！欢迎使用消息处理机器人。\n发送【帮助】查看可用命令。',
      };

    case 'unsubscribe':
      // No reply on unsubscribe (user has already left)
      return null;

    case 'scan':
      return {
        type: 'text',
        content: `您扫描了二维码，场景值：${message.event?.key ?? ''}`,
      };

    case 'click':
      return {
        type: 'text',
        content: `您点击了菜单：${message.event?.key ?? ''}`,
      };

    case 'view':
      // Link click — no reply needed usually
      return null;

    case 'location':
      return {
        type: 'text',
        content: '已收到您的位置上报。',
      };

    default:
      return null;
  }
}
