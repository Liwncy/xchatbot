import {handleAdminRequest} from '../admin/index.js';
import {forwardDebugRequest, loadDebugForwardConfig} from '../admin/debug.js';
import {handleWechat} from '../wechat/index.js';
import type {Env} from '../types/message.js';
import {DEBUG_FORWARDED_HEADER} from '../constants/debug.js';
import {handleTurnstileRequest} from '../turnstile/handler.js';

export async function handleFetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/admin/')) {
        return handleAdminRequest(request, env);
    }

    if (pathname.startsWith('/turnstile/')) {
        const response = await handleTurnstileRequest(request, env);
        if (response) return response;
    }

    if (!request.headers.get(DEBUG_FORWARDED_HEADER)) {
        const debugConfig = await loadDebugForwardConfig(env);
        if (debugConfig.enabled) {
            if (!debugConfig.url) {
                return new Response(
                    JSON.stringify({error: 'debug:forward:url 未在 KV 中配置'}),
                    {status: 500, headers: {'Content-Type': 'application/json'}},
                );
            }
            try {
                return await forwardDebugRequest(request, debugConfig.url);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Response(`Debug forward failed: ${message}`, {status: 502});
            }
        }
    }

    if (pathname === '/webhook/wechat' || pathname.startsWith('/webhook/wechat/')) {
        return handleWechat(request, env);
    }

    if (pathname === '/' || pathname === '/health') {
        return new Response(JSON.stringify({status: 'ok', service: 'xchatbot-wechat'}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    return new Response('Not Found', {status: 404});
}

