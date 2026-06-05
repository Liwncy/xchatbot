import type {Env} from '../types/env.js';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileVerifyResponse = {
    success?: boolean;
    'error-codes'?: string[];
};

export async function verifyTurnstileToken(secretKey: string, token: string, remoteIp: string): Promise<{success: boolean; errorCodes: string[]}> {
    const form = new URLSearchParams();
    form.set('secret', secretKey);
    form.set('response', token);
    if (remoteIp) form.set('remoteip', remoteIp);

    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: form.toString(),
    });

    const payload = (await response.json()) as TurnstileVerifyResponse;
    return {
        success: Boolean(payload.success),
        errorCodes: payload['error-codes'] ?? [],
    };
}

export function jsonResponse(data: unknown, status = 200, corsOrigin?: string): Response {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (corsOrigin) {
        headers['Access-Control-Allow-Origin'] = corsOrigin;
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    return new Response(JSON.stringify(data), {status, headers});
}

export function getAllowedOrigin(request: Request, env: Env): string {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.TURNSTILE_CORS_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (!allowed.length) return origin;
    return allowed.includes(origin) ? origin : '';
}

