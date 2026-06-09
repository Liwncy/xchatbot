import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {resolveImageDataFromMeta} from '../intent-image/recognize.js';
import {generateImageToImage, generateTextToImage} from './client.js';
import {
    AGNES_QUOTE_DRAW_KEYWORDS,
    DEFAULT_IMG2IMG_PROMPT,
    SMART_QUOTE_DRAW_KEYWORD,
} from './constants.js';
import {resolveAgnesDrawConfig} from './config.js';
import {
    buildImageToImagePrompt,
    buildQuotedTextPrompt,
    buildTextToImagePrompt,
    extractPromptFromQuoteTitle,
} from './prompt.js';
import {buildImageReply} from './reply.js';

const WECHAT_REFER_TYPE_TEXT = 1;
const WECHAT_REFER_TYPE_IMAGE = 3;

export function matchesAgnesQuoteDraw(message: IncomingMessage): boolean {
    const quote = message.quote;
    if (!quote) return false;
    return AGNES_QUOTE_DRAW_KEYWORDS.some((keyword) => quote.title.includes(keyword));
}

export async function handleAgnesQuoteDraw(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    if (!matchesAgnesQuoteDraw(message)) return null;

    const config = resolveAgnesDrawConfig(env);
    if (!config) {
        return {type: 'text', content: 'Agnes 绘图未配置 API Key，请联系管理员。'};
    }

    const quote = message.quote!;
    const title = quote.title;
    const titleExtra = extractPromptFromQuoteTitle(title, [SMART_QUOTE_DRAW_KEYWORD]);

    try {
        if (quote.referType === WECHAT_REFER_TYPE_IMAGE && quote.imageMeta) {
            const prompt = buildImageToImagePrompt(titleExtra, DEFAULT_IMG2IMG_PROMPT);
            const sourceImage = await resolveImageDataFromMeta(quote.imageMeta, env);
            if (!sourceImage) {
                return {
                    type: 'text',
                    content: '引用的是图片，但没能下载到可处理的数据。',
                };
            }

            const image = await generateImageToImage(config, prompt, sourceImage);
            return buildImageReply(image);
        }

        if (quote.referType === WECHAT_REFER_TYPE_TEXT) {
            const prompt = buildTextToImagePrompt(
                buildQuotedTextPrompt(quote.referContent ?? '', titleExtra),
            );
            if (!prompt) {
                return {
                    type: 'text',
                    content: '引用的文字为空，请在标题里补充描述，或引用有内容的文字消息。',
                };
            }

            const image = await generateTextToImage(config, prompt);
            return buildImageReply(image);
        }

        return {
            type: 'text',
            content: '引用绘图需要引用文字或图片，表情等其他类型暂不支持。',
        };
    } catch (error) {
        logger.error('Agnes 引用绘图失败', {
            title,
            referType: quote.referType,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            type: 'text',
            content: '引用绘图没成功，换种引用或描述试试？',
        };
    }
}
