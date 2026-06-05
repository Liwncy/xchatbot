import {
    HUMAN_VERIFY_SESSION_TTL_SECONDS,
    type HumanVerifySession,
    humanVerifySessionKey,
} from './shared.js';

export function parseSessionId(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[2] ?? '').trim();
}

export function parseLandingSessionId(url: URL): string {
    return decodeURIComponent((url.searchParams.get('sid') ?? '').trim());
}

export async function loadSession(kv: KVNamespace, sessionId: string): Promise<HumanVerifySession | null> {
    const raw = await kv.get(humanVerifySessionKey(sessionId));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as HumanVerifySession;
    } catch {
        return null;
    }
}

export async function saveSession(kv: KVNamespace, session: HumanVerifySession): Promise<void> {
    await kv.put(
        humanVerifySessionKey(session.id),
        JSON.stringify(session),
        {expirationTtl: HUMAN_VERIFY_SESSION_TTL_SECONDS},
    );
}

