import type { IncomingMessage, HandlerResponse, Env } from '../types/message.js';

/** 所有消息事件处理器共享的基础字段。 */
interface BaseMessageEvent {
  /** 唯一的处理器名称，用于注册和管理。 */
  name: string;
  /** 处理器功能的可读描述。 */
  description: string;
  /**
   * 处理消息并返回一条或多条回复（或返回 `null` 跳过回复）。
   * @param message - 标准化后的完整消息。
   * @param env     - Cloudflare Workers 环境变量绑定。
   */
  handle: (message: IncomingMessage, env: Env) => Promise<HandlerResponse>;
}

/**
 * 文本消息的事件处理器。
 *
 * 基于文本消息的 trimmed 内容进行匹配。
 */
export interface TextMessage extends BaseMessageEvent {
  type: 'text';
  /**
   * 判断是否应处理给定的文本内容。
   * @param content - 文本消息的 trimmed 内容。
   * @param message - 标准化后的完整消息。
   */
  match: (content: string, message: IncomingMessage) => boolean;
}

/**
 * 图片消息的事件处理器。
 *
 * 对接收到的图片消息进行匹配。
 */
export interface ImageMessage extends BaseMessageEvent {
  type: 'image';
  /**
   * 判断是否应处理给定的图片消息。
   * @param message - 标准化后的完整消息。
   */
  match: (message: IncomingMessage) => boolean;
}

/**
 * 所有消息事件类型的联合类型。
 *
 * 事件处理器按注册顺序检查。
 * 第一个 {@link TextMessage.match | match} 返回 `true` 的处理器将处理该消息。
 */
export type MessageEvent = TextMessage | ImageMessage;
