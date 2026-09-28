import type {IncomingMessage} from '../message.js';
import type {ChatSessionRef} from './types.js';

export function resolveChatSession(message: IncomingMessage): ChatSessionRef {
    const chatId = message.chatId.trim();
    if (message.source === 'group') {
        return {sessionId: chatId, sessionType: 'group'};
    }
    return {sessionId: `private:${chatId}`, sessionType: 'private'};
}
