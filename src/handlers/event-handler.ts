import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/**
 * 处理事件消息（关注、取消关注、扫描二维码等）。
 * 可根据各事件类型自定义业务逻辑。
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
      // 取消关注时无需回复（用户已离开）
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
      // 链接点击 —— 通常无需回复
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
