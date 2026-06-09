import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {TRIGGER_KEYWORDS, WAIT_FOR_IMAGE_REPLY} from './constants.js';
import {resolveImageDataFromMeta, runImageRecognize} from './recognize.js';
import {markPendingIntent} from './session.js';

export function matchesQuoteIntent(message: IncomingMessage): boolean {
    const quote = message.quote;
    if (!quote) return false;
    return TRIGGER_KEYWORDS.some((keyword) => quote.title.includes(keyword));
}

export function matchesQuoteImageIntent(message: IncomingMessage): boolean {
    return matchesQuoteIntent(message) && Boolean(message.quote?.imageMeta);
}

export async function handleQuoteImageIntent(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const imageMeta = message.quote?.imageMeta;
    if (!imageMeta) return null;

    const imageData = await resolveImageDataFromMeta(imageMeta, env);
    if (!imageData) {
        return {
            type: 'text',
            content: '引用的是图片，但没能下载到可处理的数据。',
        };
    }

    return runImageRecognize(imageData);
}

export async function handleQuoteIntent(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    if (!matchesQuoteIntent(message)) return null;

    if (matchesQuoteImageIntent(message)) {
        return handleQuoteImageIntent(message, env);
    }

    markPendingIntent(message);
    return {
        type: 'text',
        content: WAIT_FOR_IMAGE_REPLY,
    };
}
