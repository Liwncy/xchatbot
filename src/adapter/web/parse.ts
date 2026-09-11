import type {IncomingMessage} from '../../core/message.js';
import {WEB_PLATFORM, type WebInboundBody} from './types.js';

export function parseWebMessage(body: WebInboundBody): IncomingMessage {
    const content = body.content?.trim() ?? '';
    if (!content) {
        throw new Error('content is required');
    }

    const userId = body.userId?.trim() || 'web-user';
    const userName = body.userName?.trim() || undefined;
    const requestId = body.requestId?.trim() || crypto.randomUUID();

    return {
        platform: WEB_PLATFORM,
        type: 'text',
        source: 'private',
        from: userId,
        senderName: userName,
        to: 'xchatbot',
        timestamp: Math.floor(Date.now() / 1000),
        messageId: requestId,
        content,
        raw: body,
    };
}
