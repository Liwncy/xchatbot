import type {IncomingMessage} from '../types/message.js';
import type {ChatSessionRef, ChatSessionType} from './types.js';

export function resolveChatSession(message: IncomingMessage): ChatSessionRef {
    const roomId = message.room?.id?.trim();
    if (roomId) {
        return {sessionId: roomId, sessionType: 'group'};
    }

    const userId = message.from.trim();
    return {sessionId: `private:${userId}`, sessionType: 'private'};
}

export function resolveSessionIdFromReceiver(receiver: string, sessionType: ChatSessionType): string {
    const normalized = receiver.trim();
    if (sessionType === 'group') return normalized;
    return normalized.startsWith('private:') ? normalized : `private:${normalized}`;
}
