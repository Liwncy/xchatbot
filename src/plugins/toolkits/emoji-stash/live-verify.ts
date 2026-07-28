import type {TextMessage} from '../../types.js';
import {handleLiveEmojiVerifyAt} from './service.js';

function contentHasAtSign(content: string): boolean {
    return content.includes('@') || content.includes('＠');
}

/**
 * 群内持续验证旁路：消息含 @ 时抢先处理，未开启则返回 null 交给后续插件。
 * 需注册在聊天类插件之前，避免被 AI 对话先吃掉。
 */
export const emojiStashLiveVerifyPlugin: TextMessage = {
    type: 'text',
    name: 'emoji-stash-live-verify',
    description: '群内持续验证表情：见到 @ 随机验一个未发送表情',

    match: (content, message) => {
        return Boolean(message.room?.id) && contentHasAtSign(content);
    },

    handle: async (message, env) => {
        return handleLiveEmojiVerifyAt(message, env);
    },
};
