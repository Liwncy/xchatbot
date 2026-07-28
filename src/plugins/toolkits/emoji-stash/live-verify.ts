import type {TextMessage} from '../../types.js';
import {handleLiveEmojiVerifyAt} from './service.js';

function contentHasAtSign(content: string): boolean {
    return content.includes('@') || content.includes('＠');
}

/**
 * 群内持续验证旁路：消息含 @ 且无人命中时再处理。
 * 注册靠后，让其他插件先走；未开启则返回 null。
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
