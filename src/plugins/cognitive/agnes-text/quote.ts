import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {AGNES_TEXT_DEFAULT_MEDIA_PROMPT, AGNES_TEXT_TRIGGER_KEYWORDS} from './constants.js';
import {buildQuotedTextPrompt, extractPromptFromQuoteTitle} from './prompt.js';
import {
    runAgnesTextChat,
    runAgnesTextWithEmojiCdnurl,
    runAgnesTextWithImageMeta,
} from './service.js';

const WECHAT_REFER_TYPE_TEXT = 1;
const WECHAT_REFER_TYPE_IMAGE = 3;
const WECHAT_REFER_TYPE_EMOJI = 47;

export function matchesAgnesTextQuote(message: IncomingMessage): boolean {
    const quote = message.quote;
    if (!quote) return false;
    return AGNES_TEXT_TRIGGER_KEYWORDS.some((keyword) => quote.title.includes(keyword));
}

export async function handleAgnesTextQuote(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    if (!matchesAgnesTextQuote(message)) return null;

    const quote = message.quote!;
    const titleExtra = extractPromptFromQuoteTitle(quote.title, AGNES_TEXT_TRIGGER_KEYWORDS);

    if (quote.referType === WECHAT_REFER_TYPE_IMAGE && quote.imageMeta) {
        const userText = titleExtra || AGNES_TEXT_DEFAULT_MEDIA_PROMPT;
        return runAgnesTextWithImageMeta(env, quote.imageMeta, userText);
    }

    if (quote.referType === WECHAT_REFER_TYPE_EMOJI) {
        const cdnurl = quote.emojiMeta?.cdnurl?.trim();
        if (!cdnurl) {
            return {type: 'text', content: '引用的是表情，但未能解析 cdnurl。'};
        }
        const userText = titleExtra || AGNES_TEXT_DEFAULT_MEDIA_PROMPT;
        return runAgnesTextWithEmojiCdnurl(env, cdnurl, userText);
    }

    if (quote.referType === WECHAT_REFER_TYPE_TEXT) {
        const userText = buildQuotedTextPrompt(quote.referContent ?? '', titleExtra);
        if (!userText.trim()) {
            return {type: 'text', content: '引用的文字为空，请在标题里补充问题。'};
        }
        return runAgnesTextChat(env, userText);
    }

    return {
        type: 'text',
        content: '聪明闪答目前支持引用文字、图片或表情一起提问。',
    };
}
