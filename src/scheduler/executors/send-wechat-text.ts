import type {TextReply} from '../../types/message.js';
import {WechatApi} from '../../wechat/api.js';
import {sendWechatReply} from '../../wechat/index.js';
import type {SchedulerExecutor} from './types.js';
import {ensurePlainObject} from '../utils.js';

interface SendWechatTextPayload {
    receiver?: string;
    content: string;
    mentions?: string[];
}

export const sendWechatTextExecutor: SchedulerExecutor<SendWechatTextPayload> = {
    key: 'send-wechat-text',
    description: '主动发送一条微信文本消息',
    supportsManualTrigger: true,
    validate(payload: unknown): SendWechatTextPayload {
        const record = ensurePlainObject(payload, 'payload');
        const content = typeof record.content === 'string' ? record.content.trim() : '';
        if (!content) {
            throw new Error('payload.content is required');
        }
        const receiver = typeof record.receiver === 'string' ? record.receiver.trim() : '';
        const mentions = Array.isArray(record.mentions)
            ? record.mentions.map((item) => String(item).trim()).filter(Boolean)
            : undefined;
        return {
            receiver: receiver || undefined,
            content,
            mentions,
        };
    },
    async execute(context) {
        const apiBaseUrl = context.env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) {
            throw new Error('WECHAT_API_BASE_URL is required for send-wechat-text executor');
        }
        const receiver = context.payload.receiver?.trim() || context.env.BOT_OWNER_WECHAT_ID?.trim() || '';
        if (!receiver) {
            throw new Error('payload.receiver or env.BOT_OWNER_WECHAT_ID is required');
        }

        const api = new WechatApi(apiBaseUrl);
        const reply: TextReply = {
            type: 'text',
            content: context.payload.content,
            mentions: context.payload.mentions,
        };
        await sendWechatReply(api, reply, receiver);

        return {
            status: 'success',
            message: `Sent wechat text to ${receiver}`,
            result: {
                receiver,
                contentLength: context.payload.content.length,
                mentions: context.payload.mentions ?? [],
            },
        };
    },
};

