import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理视频消息。
 * 可替换为自定义业务逻辑。
 */
export async function handleVideoMessage(
	_message: IncomingMessage,
	_env: Env,
): Promise<HandlerResponse> {
	logger.info('收到视频消息，但暂时无法处理。');
	return null;
}

