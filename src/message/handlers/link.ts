import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {
	handleQuoteIntent,
} from '../../plugins/cognitive/intent-image/quote.js';
import {handleAgnesQuoteDraw} from '../../plugins/cognitive/agnes-draw/quote.js';
import {handleAgnesQuoteVideo} from '../../plugins/cognitive/agnes-video/quote.js';
import {handleAgnesTextQuote} from '../../plugins/cognitive/agnes-text/quote.js';
import {handleEmojiStashQuote} from '../../plugins/toolkits/emoji-stash/quote.js';
import {handleMessageRevokeQuote} from '../../plugins/system/message-revoke/quote.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理链接消息。
 * 可替换为自定义业务逻辑。
 */
export async function handleLinkMessage(
	message: IncomingMessage,
	env: Env,
): Promise<HandlerResponse> {
	const revokeQuoteResponse = await handleMessageRevokeQuote(message, env);
	if (revokeQuoteResponse) return revokeQuoteResponse;

	const agnesTextQuoteResponse = await handleAgnesTextQuote(message, env);
	if (agnesTextQuoteResponse) return agnesTextQuoteResponse;

	const emojiStashQuoteResponse = await handleEmojiStashQuote(message, env);
	if (emojiStashQuoteResponse) return emojiStashQuoteResponse;

	const agnesQuoteVideoResponse = await handleAgnesQuoteVideo(message, env);
	if (agnesQuoteVideoResponse) return agnesQuoteVideoResponse;

	const agnesQuoteResponse = await handleAgnesQuoteDraw(message, env);
	if (agnesQuoteResponse) return agnesQuoteResponse;

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

