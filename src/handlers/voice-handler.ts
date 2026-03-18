import type {IncomingMessage, HandlerResponse, Env} from '../types/message.js';
import {logger} from '../utils/logger.js';

/**
 * 处理语音消息。
 * 可替换为自定义业务逻辑（如语音转文字等）。
 */
export async function handleVoiceMessage(
    _message: IncomingMessage,
    _env: Env,
): Promise<HandlerResponse> {
    logger.info('收到语音消息，但暂时无法处理。');
    return null;
}
