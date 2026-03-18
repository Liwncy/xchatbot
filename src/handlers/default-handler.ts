import type {IncomingMessage, HandlerResponse, Env} from '../types/message.js';
import {logger} from '../utils/logger.js';

/**
 * 未识别消息类型的默认兜底处理器。
 */
export async function handleDefault(
    _message: IncomingMessage,
    _env: Env,
): Promise<HandlerResponse> {
    logger.warn(`收到不支持的消息类型：${_message.type}`);
    return null;
}
