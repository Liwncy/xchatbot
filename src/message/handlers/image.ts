import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {setChatLogHandleMeta} from '../../chat-log/index.js';
import {findMatchingPlugins} from '../../plugins/dispatcher.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理图片消息。
 * 可替换为自定义业务逻辑（如图像识别、OCR 等）。
 */
export async function handleImageMessage(
	message: IncomingMessage,
	env: Env,
): Promise<HandlerResponse> {
	const plugins = findMatchingPlugins(message);
	for (const plugin of plugins) {
		const result = await plugin.handle(message, env);
		if (result) {
			setChatLogHandleMeta(message, {pluginName: plugin.name});
			return result;
		}
	}

	logger.info('收到图片消息，但未命中图片插件。');
	return null;
}

