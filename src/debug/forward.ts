import type {Env} from '../types/env.js';

/** 开关默认 8 小时后自己关掉。 */
export const DEBUG_TTL_SECONDS = 8 * 60 * 60;

/** 本地再收到这个头就停，避免和生产互相转。 */
export const DEBUG_FORWARDED_HEADER = 'x-xchatbot-debug-forwarded';

const KV_DEBUG_ENABLED = 'debug:forward:enabled';
const KV_DEBUG_URL = 'debug:forward:url';

export type DebugForwardConfig = {
    enabled: boolean;
    url: string;
};

function isEnabledFlag(value: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

export async function loadDebugForwardConfig(env: Env): Promise<DebugForwardConfig> {
    const [enabled, url] = await Promise.all([
        env.XBOT_KV.get(KV_DEBUG_ENABLED),
        env.XBOT_KV.get(KV_DEBUG_URL),
    ]);
    return {
        enabled: isEnabledFlag(enabled),
        url: url?.trim() ?? '',
    };
}

export async function enableDebugForward(
    env: Env,
    url: string,
    ttlSeconds: number,
): Promise<string> {
    await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'true', {expirationTtl: ttlSeconds});
    if (url) {
        await env.XBOT_KV.put(KV_DEBUG_URL, url, {expirationTtl: ttlSeconds});
    }
    return (await env.XBOT_KV.get(KV_DEBUG_URL))?.trim() ?? '';
}

export async function disableDebugForward(env: Env): Promise<void> {
    await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'false');
}

export async function forwardDebugRequest(request: Request, debugUrl: string): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, debugUrl);

    const headers = new Headers(request.headers);
    headers.set(DEBUG_FORWARDED_HEADER, '1');
    headers.delete('host');

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

/** 头已在时直接返回 null，不读 KV。没开也返回 null。 */
export async function maybeForwardDebug(request: Request, env: Env): Promise<Response | null> {
    if (request.headers.get(DEBUG_FORWARDED_HEADER)) return null;

    const config = await loadDebugForwardConfig(env);
    if (!config.enabled) return null;
    if (!config.url) {
        return new Response(
            JSON.stringify({error: 'debug:forward:url 未在 KV 中配置'}),
            {status: 500, headers: {'Content-Type': 'application/json'}},
        );
    }

    try {
        return await forwardDebugRequest(request, config.url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(`Debug forward failed: ${message}`, {status: 502});
    }
}
