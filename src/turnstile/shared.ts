export type HumanVerifyStatus = 'pending' | 'human' | 'bot';

export interface HumanVerifySession {
    id: string;
    requesterId: string;
    requesterName: string;
    roomId?: string;
    status: HumanVerifyStatus;
    createdAt: number;
    updatedAt: number;
    verifiedAt?: number;
    verifyErrorCodes?: string[];
}

export const HUMAN_VERIFY_SESSION_TTL_SECONDS = 60 * 60 * 24;

export function humanVerifySessionKey(sessionId: string): string {
    return `turnstile:session:${sessionId}`;
}

export function humanVerifyLatestByUserKey(userId: string): string {
    return `turnstile:user:${userId}:latest`;
}

export function createHumanVerifySessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '');
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}${rand}`;
}

export function buildTurnstileCheckUrl(baseUrl: string, sessionId: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    return `${normalized}/turnstile/check/${encodeURIComponent(sessionId)}`;
}

export function buildTurnstileLandingUrl(baseUrl: string, sessionId: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    return `${normalized}/turnstile/landing?sid=${encodeURIComponent(sessionId)}`;
}

