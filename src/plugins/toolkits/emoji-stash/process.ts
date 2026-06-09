import type {EmojiMessage} from '../../types.js';
import {
    autoCollectEmojiFromMessage,
    hasEmojiStashPending,
    saveEmojiFromMessage,
} from './service.js';

export const emojiStashProcessPlugin: EmojiMessage = {
    type: 'emoji',
    name: 'emoji-stash-process',
    description: '表情库：手动 pending 收藏 + 自动收藏',

    match: () => true,

    handle: async (message, env) => {
        if (await hasEmojiStashPending(message, env)) {
            return saveEmojiFromMessage(message, env);
        }
        return autoCollectEmojiFromMessage(message, env);
    },
};
