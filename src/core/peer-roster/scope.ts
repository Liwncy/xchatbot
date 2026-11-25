import {sessionIdFromScope} from '../chat-log/query.js';
import type {IncomingMessage} from '../message.js';

export function normalizeRosterScope(scope: string): string {
    const session = sessionIdFromScope(scope);
    if (!session) return scope.trim();
    if (session.startsWith('private:')) return session;
    return `group:${session}`;
}

/** 落库用的会话 id：和 chat_message.session_id 一个写法（群就是群 id 本身，不带 `group:`）。 */
export function rosterSessionId(scope: string): string {
    const session = sessionIdFromScope(scope);
    return session || scope.trim();
}

export function scopeFromMessage(message: IncomingMessage): string {
    if (message.source === 'group') {
        return normalizeRosterScope(`group:${message.chatId}`);
    }
    return normalizeRosterScope(`user:${message.chatId}`);
}
