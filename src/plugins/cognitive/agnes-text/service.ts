import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {requestAgnesTextCompletion} from './client.js';
import {resolveAgnesTextConfig} from './config.js';
import {AGNES_TEXT_DEFAULT_MEDIA_PROMPT} from './constants.js';
import {
    resolvePublicImageUrlFromEmojiCdnurl,
    resolvePublicImageUrlFromMessage,
    resolvePublicImageUrlFromMeta,
} from './resolve-image.js';

const MEDIA_HINT_PATTERN = /这张|这个图|图上|图中|截图|图片里|看看这|报错|识别|读一下|分析|解释|帮忙看|帮看下/u;

/** 问题明显依赖图片/文件时，等待用户下一条媒体消息。 */
export function shouldWaitForMediaMessage(prompt: string): boolean {
    const trimmed = prompt.trim();
    if (!trimmed) return true;
    return MEDIA_HINT_PATTERN.test(trimmed);
}

export async function runAgnesTextChat(
    env: Env,
    userText: string,
    imageUrl?: string,
): Promise<HandlerResponse> {
    const config = resolveAgnesTextConfig(env);
    if (!config) {
        return {type: 'text', content: 'Agnes 未配置 API Key，请联系管理员。'};
    }

    const trimmed = userText.trim();
    if (!trimmed && !imageUrl) {
        return {type: 'text', content: '请在触发词后面输入你的问题。'};
    }

    try {
        const answer = await requestAgnesTextCompletion(config, {
            userText: trimmed || AGNES_TEXT_DEFAULT_MEDIA_PROMPT,
            imageUrl,
        });
        if (!answer) {
            return {type: 'text', content: 'Agnes 没有返回内容，请稍后再试。'};
        }
        return {type: 'text', content: answer};
    } catch (error) {
        logger.error('Agnes 对话失败', {
            userText: trimmed,
            imageUrl,
            error: error instanceof Error ? error.message : String(error),
        });
        return {type: 'text', content: 'Agnes 这次没答上来，换个说法试试？'};
    }
}

export async function runAgnesTextWithImageMessage(
    message: IncomingMessage,
    env: Env,
    userText: string,
): Promise<HandlerResponse> {
    const imageUrl = await resolvePublicImageUrlFromMessage(message, env);
    if (!imageUrl) {
        return {
            type: 'text',
            content: '没能拿到可访问的图片链接，无法连同文件一起提问。',
        };
    }
    return runAgnesTextChat(env, userText, imageUrl);
}

export async function runAgnesTextWithEmojiMessage(
    message: IncomingMessage,
    env: Env,
    userText: string,
): Promise<HandlerResponse> {
    const cdnurl = message.emoji?.cdnurl?.trim();
    if (!cdnurl) {
        return {type: 'text', content: '未能解析表情数据，无法连同表情一起提问。'};
    }
    const imageUrl = await resolvePublicImageUrlFromEmojiCdnurl(cdnurl);
    if (!imageUrl) {
        return {
            type: 'text',
            content: '没能把表情转成可访问的公网图链，无法提问。',
        };
    }
    return runAgnesTextChat(env, userText, imageUrl);
}

export async function runAgnesTextWithImageMeta(
    env: Env,
    imageMeta: NonNullable<IncomingMessage['quote']>['imageMeta'],
    userText: string,
): Promise<HandlerResponse> {
    const imageUrl = await resolvePublicImageUrlFromMeta(imageMeta, env);
    if (!imageUrl) {
        return {
            type: 'text',
            content: '引用了图片，但没能转成 Agnes 可访问的公网图链。',
        };
    }
    return runAgnesTextChat(env, userText, imageUrl);
}

export async function runAgnesTextWithEmojiCdnurl(
    env: Env,
    cdnurl: string,
    userText: string,
): Promise<HandlerResponse> {
    const imageUrl = await resolvePublicImageUrlFromEmojiCdnurl(cdnurl);
    if (!imageUrl) {
        return {
            type: 'text',
            content: '没能把表情转成可访问的公网图链，无法提问。',
        };
    }
    return runAgnesTextChat(env, userText, imageUrl);
}
