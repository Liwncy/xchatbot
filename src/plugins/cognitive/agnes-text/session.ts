import {AGNES_TEXT_PENDING_TTL_MS} from './constants.js';

const pendingBySession = new Map<string, {expiresAt: number; question?: string}>();

function getSessionKey(message: {from: string; room?: {id: string}}): string {
    return message.room?.id ? `${message.room.id}:${message.from}` : message.from;
}

function purgeExpired(now: number): void {
    for (const [key, value] of pendingBySession.entries()) {
        if (value.expiresAt <= now) pendingBySession.delete(key);
    }
}

export function markAgnesTextPending(
    message: {from: string; room?: {id: string}},
    question?: string,
): void {
    pendingBySession.set(getSessionKey(message), {
        expiresAt: Date.now() + AGNES_TEXT_PENDING_TTL_MS,
        question: question?.trim() || undefined,
    });
}

export function getAgnesTextPendingQuestion(message: {from: string; room?: {id: string}}): string | undefined {
    const now = Date.now();
    purgeExpired(now);
    const pending = pendingBySession.get(getSessionKey(message));
    if (!pending || pending.expiresAt <= now) return undefined;
    return pending.question;
}

export function hasAgnesTextPending(message: {from: string; room?: {id: string}}): boolean {
    const now = Date.now();
    purgeExpired(now);
    const pending = pendingBySession.get(getSessionKey(message));
    return Boolean(pending && pending.expiresAt > now);
}

export function clearAgnesTextPending(message: {from: string; room?: {id: string}}): void {
    pendingBySession.delete(getSessionKey(message));
}
