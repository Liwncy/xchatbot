import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {setChatLogHandleMeta} from '../../chat-log/index.js';
import {findMatchingPlugins} from '../../plugins/dispatcher.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理文本消息。
 * 优先检查已注册的插件，未匹配时走内置关键词路由。
 */
export async function handleTextMessage(
	message: IncomingMessage,
	env: Env,
): Promise<HandlerResponse> {
	const trimmed = (message.content ?? '').trim();

	const plugins = findMatchingPlugins(message);
	for (const plugin of plugins) {
		const result = await plugin.handle(message, env);
		if (result) {
			setChatLogHandleMeta(message, {pluginName: plugin.name});
			return result;
		}
	}

	const content = trimmed.toLowerCase();

	if (content === 'help' || content === '帮助') {
		return {
			type: 'text',
			content:
				'您好！我是消息处理机器人。\n' +
				'目前支持以下命令：\n' +
				'【帮助】显示帮助信息\n' +
				'【关于】关于本机器人',
		};
	}

	if (content === 'about' || content === '关于') {
		return {
			type: 'text',
			content: '本机器人基于 Cloudflare Workers 构建，支持多平台消息处理。',
		};
	}

	logger.info(`收到文本消息：${message.content ?? ''}`);
	return null;
}

