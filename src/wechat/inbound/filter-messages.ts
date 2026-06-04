import type {IncomingMessage} from '../../types/message.js';
import {logger} from '../../utils/logger.js';

export const MESSAGE_EXPIRE_SECONDS = 3 * 60;

function isExpiredMessage(message: IncomingMessage, nowUnixSeconds: number): boolean {
    return nowUnixSeconds - message.timestamp > MESSAGE_EXPIRE_SECONDS;
}

export function filterExpiredWechatMessages(
    messages: IncomingMessage[],
    nowUnixSeconds = Math.floor(Date.now() / 1000),
): {activeMessages: IncomingMessage[]; expiredCount: number} {
    const activeMessages = messages.filter((message) => !isExpiredMessage(message, nowUnixSeconds));
    const expiredCount = messages.length - activeMessages.length;
    if (expiredCount > 0) {
        logger.debug('跳过过期微信消息', {expiredCount, thresholdSeconds: MESSAGE_EXPIRE_SECONDS});
    }
    return {activeMessages, expiredCount};
}

