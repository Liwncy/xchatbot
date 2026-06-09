const WAIT_IMAGE_TTL_MS = 2 * 60 * 1000;

const pendingImageBySession = new Map<string, number>();

function getSessionKey(message: {from: string; room?: {id: string}}): string {
    return message.room?.id ? `${message.room.id}:${message.from}` : message.from;
}

function purgeExpiredPending(now: number): void {
    for (const [key, expiresAt] of pendingImageBySession.entries()) {
        if (expiresAt <= now) pendingImageBySession.delete(key);
    }
}

export function hasPendingIntent(message: {from: string; room?: {id: string}}): boolean {
    const now = Date.now();
    purgeExpiredPending(now);
    const expiresAt = pendingImageBySession.get(getSessionKey(message));
    return Boolean(expiresAt && expiresAt > now);
}

export function markPendingIntent(message: {from: string; room?: {id: string}}): void {
    pendingImageBySession.set(getSessionKey(message), Date.now() + WAIT_IMAGE_TTL_MS);
}

export function clearPendingIntent(message: {from: string; room?: {id: string}}): void {
    pendingImageBySession.delete(getSessionKey(message));
}

export function clearImageIntentStateForTest(): void {
    pendingImageBySession.clear();
}
