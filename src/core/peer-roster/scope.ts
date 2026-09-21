import {sessionIdFromScope} from '../chat-log/query.js';
import type {IncomingMessage} from '../message.js';

export function normalizeRosterScope(scope: string): string {
    const session = sessionIdFromScope(scope);
    if (!session) return scope.trim();
    if (session.startsWith('private:')) return session;
    return `group:${session}`;
}

export function scopeFromMessage(message: IncomingMessage): string {
    if (message.source === 'group') {
        return normalizeRosterScope(`group:${message.room?.id ?? ''}`);
    }
    return normalizeRosterScope(`user:${message.from}`);
}
