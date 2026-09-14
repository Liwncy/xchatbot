import type {IncomingMessage} from '../message.js';
import type {ChatSessionRef} from './types.js';

export function resolveChatSession(message: IncomingMessage): ChatSessionRef {
    const roomId = message.room?.id?.trim();
    if (roomId) {
        return {sessionId: roomId, sessionType: 'group'};
    }
    return {sessionId: `private:${message.from.trim()}`, sessionType: 'private'};
}
