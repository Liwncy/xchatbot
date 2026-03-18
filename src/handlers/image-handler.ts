import type {IncomingMessage, HandlerResponse, Env} from '../types/message.js';
import {logger} from '../utils/logger.js';

/**
 * 处理图片消息。
 * 可替换为自定义业务逻辑（如图像识别、OCR 等）。
 */
export async function handleImageMessage(
    _message: IncomingMessage,
    _env: Env,
): Promise<HandlerResponse> {
    logger.info('收到图片消息，但暂时无法处理。');
    return null;
}
