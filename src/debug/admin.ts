import type {Env} from '../types/env.js';
import {
    DEBUG_TTL_SECONDS,
    disableDebugForward,
    enableDebugForward,
    loadDebugForwardConfig,
} from './forward.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

function authorize(request: Request, env: Env): Response | null {
    const adminToken = env.ADMIN_TOKEN?.trim();
    if (!adminToken) return null;

    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token === adminToken) return null;

    return json({error: 'Unauthorized'}, 401);
}

function readTtl(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEBUG_TTL_SECONDS;
    if (value < 60 || value > 86400) return DEBUG_TTL_SECONDS;
    return Math.floor(value);
}

export async function handleAdminDebug(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorize(request, env);
    if (unauthorized) return unauthorized;

    const pathname = new URL(request.url).pathname;

    if (request.method === 'GET') {
        const config = await loadDebugForwardConfig(env);
        return json({
            enabled: config.enabled,
            url: config.url || null,
            tips: 'POST /admin/debug/enable  body:{"url":"..."} 开启转发\nPOST /admin/debug/disable 关闭转发',
        });
    }

    if (request.method === 'POST' && pathname.endsWith('/enable')) {
        let forwardUrl = '';
        let ttl = DEBUG_TTL_SECONDS;
        try {
            const body = await request.json() as {url?: string; ttl?: number};
            forwardUrl = body?.url?.trim() ?? '';
            ttl = readTtl(body?.ttl);
        } catch {
            // 非 JSON 时沿用已有地址和默认时长
        }

        if (forwardUrl) {
            try {
                const parsed = new URL(forwardUrl);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    return json({error: 'url 需要 http 或 https'}, 400);
                }
            } catch {
                return json({error: 'url 不是合法地址'}, 400);
            }
        }

        const saved = await enableDebugForward(env, forwardUrl, ttl);
        return json({
            ok: true,
            enabled: true,
            url: saved,
            expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
            ttlSeconds: ttl,
        });
    }

    if (request.method === 'POST' && pathname.endsWith('/disable')) {
        await disableDebugForward(env);
        return json({ok: true, enabled: false});
    }

    return new Response('Not Found', {status: 404});
}
