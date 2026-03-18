import {handleWechat} from './wechat/index.js';
import type {Env} from './types/message.js';

function isTruthyFlag(value?: string): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

async function forwardDebugRequest(request: Request, debugUrl: string): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetBase = new URL(debugUrl);
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, targetBase);

    const init: RequestInit = {
        method: request.method,
        headers: request.headers,
        redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
    }

    return fetch(targetUrl.toString(), init);
}

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        const debugForwardEnabled = isTruthyFlag(env.DEBUG_FORWARD_ENABLED);
        const debugForwardUrl = env.DEBUG_FORWARD_URL?.trim() ?? '';

        // 全局调试透传：开启后所有请求都直接转发到调试地址。
        if (debugForwardEnabled) {
            if (!debugForwardUrl) {
                return new Response('DEBUG_FORWARD_URL is required when DEBUG_FORWARD_ENABLED=true', {
                    status: 500,
                });
            }

            try {
                return await forwardDebugRequest(request, debugForwardUrl);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new Response(`Debug forward failed: ${message}`, {status: 502});
            }
        }

        const url = new URL(request.url);
        const pathname = url.pathname;


        // 微信专用入口
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
    },
} satisfies ExportedHandler<Env>;
