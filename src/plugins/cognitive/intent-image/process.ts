import type {ImageMessage} from '../../types.js';
import {logger} from '../../../utils/logger.js';
import {AI_RECOGNIZE_URL, buildRecognizeRequest, resolveImageDataForRecognize} from './recognize.js';
import {clearPendingIntent, hasPendingIntent} from './session.js';
import type {AiRecognizeResponse} from './types.js';

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

        try {
            const request = buildRecognizeRequest(imageData);
            const res = await fetch(AI_RECOGNIZE_URL, {
                method: 'POST',
                headers: request.headers,
                body: request.body,
            });

            if (!res.ok) {
                logger.error('AI 识图接口请求失败', {status: res.status});
                return {
                    type: 'text',
                    content: '这张图我没认出来，换一张试试？',
                };
            }

            const data = (await res.json()) as AiRecognizeResponse;
            const result = (data.result ?? '').trim();
            if (!result) {
                logger.warn('AI 识图接口未返回 result', {payload: data});
                return {
                    type: 'text',
                    content: '看了半天没看出个所以然，换一张再试试？',
                };
            }

            return {
                type: 'text',
                content: `识图结果：${result}`,
            };
        } catch (error) {
            logger.error('调用 AI 识图接口异常', error);
            return {
                type: 'text',
                content: '看图的时候眼睛有点花，再发一次试试？',
            };
        }
    },
};
