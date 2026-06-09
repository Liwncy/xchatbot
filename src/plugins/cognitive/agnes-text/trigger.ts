import type {TextMessage} from '../../types.js';
import {AGNES_TEXT_WAIT_MEDIA_REPLY, AGNES_TEXT_TRIGGER_KEYWORDS} from './constants.js';
import {extractPromptAfterKeyword} from './prompt.js';
import {markAgnesTextPending} from './session.js';
import {runAgnesTextChat, shouldWaitForMediaMessage} from './service.js';

function matchesTextTrigger(content: string): boolean {
    const trimmed = content.trim();
    return AGNES_TEXT_TRIGGER_KEYWORDS.some((keyword) => trimmed.startsWith(keyword));
}

function buildUsageHint(): string {
    return [
        '用法示例：',
        '· Agnes 介绍一下 Cloudflare Workers（纯文字）',
        '· Agnes 这个报错什么意思（再发截图，或引用图片后发送）',
        '· 引用图片/表情 + Agnes 帮我看看这是什么',
    ].join('\n');
}

export const agnesTextTriggerPlugin: TextMessage = {
    type: 'text',
    name: 'agnes-text',
    description: 'Agnes-2.0-Flash 多模态问答（文字 / 图片 / 表情）',

    match: (content) => matchesTextTrigger(content),

    handle: async (message, env) => {
        const prompt = extractPromptAfterKeyword(message.content ?? '', AGNES_TEXT_TRIGGER_KEYWORDS);
        if (!prompt) {
            markAgnesTextPending(message);
            return {
                type: 'text',
                content: `请补充你的问题。\n${AGNES_TEXT_WAIT_MEDIA_REPLY}\n\n${buildUsageHint()}`,
            };
        }

        if (shouldWaitForMediaMessage(prompt)) {
            markAgnesTextPending(message, prompt);
            return {
                type: 'text',
                content: `${AGNES_TEXT_WAIT_MEDIA_REPLY}\n\n已记下你的问题：${prompt}`,
            };
        }

        return runAgnesTextChat(env, prompt);
    },
};
