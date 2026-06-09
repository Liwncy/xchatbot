import type {TextMessage} from '../../types.js';
import {markPendingIntent} from './session.js';

const TRIGGER_KEYWORDS = ['聪明识图', '聪明认图', '聪明看图'];

export const imageIntentTriggerPlugin: TextMessage = {
    type: 'text',
    name: 'image-intent-trigger',
    description: '识图入口：收到指令后等待图片',
    match: (content) => TRIGGER_KEYWORDS.some((k) => content.includes(k)),
    handle: async (message) => {
        markPendingIntent(message);
        return {
            type: 'text',
            content: '请在2分钟内发送一张图片，我会按识图流程处理。',
        };
    },
};
