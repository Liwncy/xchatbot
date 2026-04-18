import type {IncomingMessage, HandlerResponse} from '../../../../types/message.js';
import {logger} from '../../../../utils/logger.js';
import {asText} from './context.js';

export function handleXiuxianError(message: IncomingMessage, error: unknown): HandlerResponse {
    logger.error('修仙插件处理失败', {
        error: error instanceof Error ? error.message : String(error),
        from: message.from,
        content: message.content,
    });
    return asText('⚠️ 修仙系统开小差了，请稍后再试。');
}