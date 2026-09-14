import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../../core/message.js';
import type {ReplyMessage} from '../../core/reply.js';
import {recordOutboundChatMessage} from '../../core/chat-log/index.js';
import {resolveChatId} from '../../core/context.js';
import {logger} from '../../utils/logger.js';
import {GolemApi} from './api.js';

export async function sendGolemReplies(
    apiBaseUrl: string,
    message: IncomingMessage,
    replies: ReplyMessage[],
    env: Env,
): Promise<void> {
    const api = new GolemApi(apiBaseUrl);
    const receiver = resolveChatId(message);

    for (const [index, reply] of replies.entries()) {
        const target = reply.to ?? receiver;
        try {
            const result = await api.sendText({
                receiver: target,
                content: reply.content,
                remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
            });
            const ok = result.code === 0;
            if (!ok) {
                logger.error('Golem 发文本失败', {
                    receiver: target,
                    code: result.code,
                    message: result.message,
                });
            }
            await recordOutboundChatMessage(env, message, reply, {
                causedByMessageId: message.messageId,
                replyIndex: index,
                replyStatus: ok ? 'sent' : 'failed',
                payload: result.data != null ? {golem: result.data} : undefined,
            });
        } catch (error) {
            logger.error('Golem 发文本异常', {
                receiver: target,
                error: error instanceof Error ? error.message : String(error),
            });
            await recordOutboundChatMessage(env, message, reply, {
                causedByMessageId: message.messageId,
                replyIndex: index,
                replyStatus: 'failed',
            });
        }
    }
}
