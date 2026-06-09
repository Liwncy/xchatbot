import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {
    AGNES_QUOTE_VIDEO_KEYWORDS,
    DEFAULT_IMG2VIDEO_PROMPT,
    SMART_QUOTE_VIDEO_KEYWORD,
} from './constants.js';
import {resolveAgnesVideoConfig} from './config.js';
import {
    buildImageToVideoPrompt,
    buildQuotedTextPrompt,
    buildTextToVideoPrompt,
    extractPromptFromQuoteTitle,
} from './prompt.js';
import {
    buildConfigMissingReply,
    buildQuoteEmptyTextReply,
    buildQuoteSubmitFailedReply,
    buildQuoteUnsupportedReferReply,
    buildSubmittedReply,
} from './reply.js';
import {submitAgnesVideoTask} from './submit.js';

const WECHAT_REFER_TYPE_TEXT = 1;
const WECHAT_REFER_TYPE_IMAGE = 3;

export function matchesAgnesQuoteVideo(message: IncomingMessage): boolean {
    const quote = message.quote;
    if (!quote) return false;
    return AGNES_QUOTE_VIDEO_KEYWORDS.some((keyword) => quote.title.includes(keyword));
}

export async function handleAgnesQuoteVideo(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    if (!matchesAgnesQuoteVideo(message)) return null;

    const config = resolveAgnesVideoConfig(env);
    if (!config) {
        return buildConfigMissingReply();
    }

    const quote = message.quote!;
    const title = quote.title;
    const titleExtra = extractPromptFromQuoteTitle(title, [SMART_QUOTE_VIDEO_KEYWORD]);

    try {
        if (quote.referType === WECHAT_REFER_TYPE_IMAGE && quote.imageMeta) {
            const prompt = buildImageToVideoPrompt(titleExtra, DEFAULT_IMG2VIDEO_PROMPT);

            const record = await submitAgnesVideoTask({
                config,
                env,
                prompt,
                sourceImageMeta: quote.imageMeta,
                from: message.from,
                roomId: message.room?.id,
                mode: 'quote',
            });
            return buildSubmittedReply(record);
        }

        if (quote.referType === WECHAT_REFER_TYPE_TEXT) {
            const prompt = buildTextToVideoPrompt(
                buildQuotedTextPrompt(quote.referContent ?? '', titleExtra),
            );
            if (!prompt) {
                return buildQuoteEmptyTextReply();
            }

            const record = await submitAgnesVideoTask({
                config,
                env,
                prompt,
                from: message.from,
                roomId: message.room?.id,
                mode: 'text',
            });
            return buildSubmittedReply(record);
        }

        return buildQuoteUnsupportedReferReply();
    } catch (error) {
        logger.error('Agnes 引用绘影失败', {
            title,
            referType: quote.referType,
            error: error instanceof Error ? error.message : String(error),
        });
        const detail = error instanceof Error ? error.message : String(error);
        return buildQuoteSubmitFailedReply(detail);
    }
}
