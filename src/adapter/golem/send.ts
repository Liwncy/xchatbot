import type {IncomingMessage} from '../../core/message.js';
import type {ReplyMessage} from '../../core/reply.js';
import {resolveChatId} from '../../core/context.js';
import {logger} from '../../utils/logger.js';
import {GolemApi} from './api.js';

export async function sendGolemReplies(
    apiBaseUrl: string,
    message: IncomingMessage,
    replies: ReplyMessage[],
): Promise<void> {
    const api = new GolemApi(apiBaseUrl);
    const receiver = resolveChatId(message);

    for (const reply of replies) {
        const target = reply.to ?? receiver;
        const result = await api.sendText({
            receiver: target,
            content: reply.content,
            remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
        });
        if (result.code !== 0) {
            logger.error('Golem 发文本失败', {
                receiver: target,
                code: result.code,
                message: result.message,
            });
        }
    }
}
