import type {Env} from './env.js';
import type {IncomingMessage} from './message.js';
import type {HandlerResponse} from './reply.js';

/** 插件 handle 可选运行时上下文（如微信后台续跑）。 */
export interface MessageHandlerContext {
    waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * 插件/消息处理器函数签名。
 *
 * - 输入：标准化后的消息对象
 * - 环境：Cloudflare Workers 运行时绑定
 * - 输出：单条回复、多条回复或不回复
 */
export type MessageHandler = (
    message: IncomingMessage,
    env: Env,
    handlerContext?: MessageHandlerContext,
) => Promise<HandlerResponse>;

