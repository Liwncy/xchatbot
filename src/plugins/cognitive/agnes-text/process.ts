import type {EmojiMessage, ImageMessage} from '../../types.js';
import {AGNES_TEXT_DEFAULT_MEDIA_PROMPT} from './constants.js';
import {
    clearAgnesTextPending,
    getAgnesTextPendingQuestion,
    hasAgnesTextPending,
} from './session.js';
import {runAgnesTextWithEmojiMessage, runAgnesTextWithImageMessage} from './service.js';

function resolvePendingQuestion(message: {from: string; room?: {id: string}}): string {
    return getAgnesTextPendingQuestion(message) || AGNES_TEXT_DEFAULT_MEDIA_PROMPT;
}

export const agnesTextImageProcessPlugin: ImageMessage = {
    type: 'image',
    name: 'agnes-text-image-process',
    description: 'Agnes 多模态问答：处理 pending 流程中的图片',

    match: (message) => hasAgnesTextPending(message),

    handle: async (message, env) => {
        const question = resolvePendingQuestion(message);
        clearAgnesTextPending(message);
        return runAgnesTextWithImageMessage(message, env, question);
    },
};

export const agnesTextEmojiProcessPlugin: EmojiMessage = {
    type: 'emoji',
    name: 'agnes-text-emoji-process',
    description: 'Agnes 多模态问答：处理 pending 流程中的表情',

    match: (message) => hasAgnesTextPending(message),

    handle: async (message, env) => {
        const question = resolvePendingQuestion(message);
        clearAgnesTextPending(message);
        return runAgnesTextWithEmojiMessage(message, env, question);
    },
};
