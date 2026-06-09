import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {
	handleQuoteIntent,
} from '../../plugins/cognitive/intent-image/quote.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理链接消息。
 * 可替换为自定义业务逻辑。
 */
export async function handleLinkMessage(
	message: IncomingMessage,
	env: Env,
): Promise<HandlerResponse> {
	const quoteResponse = await handleQuoteIntent(message, env);
	if (quoteResponse) return quoteResponse;

	const link = message.link;
	if (!link) {
		return {type: 'text', content: '收到链接了，但内容打不开。'};
	}
	if (message.quote) {
		logger.info(`收到引用消息：${message.quote.title}`, {
			referType: message.quote.referType,
			referContent: message.quote.referContent,
			referFrom: message.quote.referFrom,
			referSenderName: message.quote.referSenderName,
		});
		return null;
	}
	logger.info(`收到链接消息：${link.title} ${link.url}`);
	return null;
}

