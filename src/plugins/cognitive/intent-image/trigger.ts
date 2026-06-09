import type {TextMessage} from '../../types.js';
import {TRIGGER_KEYWORDS, WAIT_FOR_IMAGE_REPLY} from './constants.js';
import {markPendingIntent} from './session.js';

export const imageIntentTriggerPlugin: TextMessage = {
    type: 'text',
    name: 'image-intent-trigger',
    description: '识图入口：收到指令后等待图片',
    match: (content) => TRIGGER_KEYWORDS.some((k) => content.includes(k)),
    handle: async (message) => {
        markPendingIntent(message);
        return {
            type: 'text',
            content: WAIT_FOR_IMAGE_REPLY,
        };
    },
};
