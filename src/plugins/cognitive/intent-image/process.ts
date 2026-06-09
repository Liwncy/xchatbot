import type {ImageMessage} from '../../types.js';
import {resolveImageDataForRecognize, runImageRecognize} from './recognize.js';
import {clearPendingIntent, hasPendingIntent} from './session.js';

export const imageIntentProcessPlugin: ImageMessage = {
    type: 'image',
    name: 'image-intent-process',
    description: '处理识图流程中的图片消息',
    match: (message) => hasPendingIntent(message),
    handle: async (message, env) => {
        clearPendingIntent(message);
        const imageData = await resolveImageDataForRecognize(message, env);
        if (!imageData) {
            return {
                type: 'text',
                content: '收到图片，但未获取到可处理的数据。',
            };
        }

        return runImageRecognize(imageData);
    },
};
