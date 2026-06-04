import type {Env} from '../types/env.js';
import {authorizeAdmin} from '../middleware/auth.js';
import {KV_DEBUG_ENABLED, KV_DEBUG_URL} from '../constants/kv.js';
import {DEBUG_FORWARDED_HEADER, DEBUG_TTL_SECONDS} from '../constants/debug.js';

function isTruthyFlag(value?: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

async function loadDebugConfig(kv: KVNamespace): Promise<{ enabled: boolean; url: string }> {
    const [enabled, url] = await Promise.all([
        kv.get(KV_DEBUG_ENABLED),
        kv.get(KV_DEBUG_URL),
    ]);
    return {
        enabled: isTruthyFlag(enabled),
        url: url?.trim() ?? '',
    };
}

export async function forwardDebugRequest(request: Request, debugUrl: string): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetBase = new URL(debugUrl);
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, targetBase);

    const headers = new Headers(request.headers);
    headers.set(DEBUG_FORWARDED_HEADER, '1');

    const init: RequestInit = {
        method: request.method,
        headers,
        redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
    }

    return fetch(targetUrl.toString(), init);
}

export async function loadDebugForwardConfig(env: Env): Promise<{ enabled: boolean; url: string }> {
    return loadDebugConfig(env.XBOT_KV);
}

export async function handleAdminDebug(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET') {
        const config = await loadDebugConfig(env.XBOT_KV);
        return new Response(JSON.stringify({
            enabled: config.enabled,
            url: config.url || null,
            tips: 'POST /admin/debug/enable  body:{"url":"..."} 开启转发\nPOST /admin/debug/disable 关闭转发',
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    if (request.method === 'POST' && pathname.endsWith('/enable')) {
        let forwardUrl = '';
        let ttl = DEBUG_TTL_SECONDS;
        try {
            const body = await request.json() as { url?: string; ttl?: number };
            forwardUrl = body?.url?.trim() ?? '';
            if (body?.ttl && body.ttl >= 60 && body.ttl <= 86400) {
                ttl = body.ttl;
            }
        } catch {
            // body 非 JSON 时忽略
        }

        await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'true', {expirationTtl: ttl});
        if (forwardUrl) {
            await env.XBOT_KV.put(KV_DEBUG_URL, forwardUrl, {expirationTtl: ttl});
        }

        const saved = await env.XBOT_KV.get(KV_DEBUG_URL);
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        return new Response(JSON.stringify({
            ok: true,
            enabled: true,
            url: saved ?? '',
            expiresAt,
            ttlSeconds: ttl,
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    if (request.method === 'POST' && pathname.endsWith('/disable')) {
        await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'false');
        return new Response(JSON.stringify({
            ok: true,
            enabled: false,
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    return new Response('Not Found', {status: 404});
}

