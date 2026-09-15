import type {Env} from './types/env.js';
import {runWithLogContext} from './core/app-log/context.js';
import {handleGolemWebhook} from './adapter/golem/webhook.js';
import {handleWebAdapter} from './adapter/web/webhook.js';
import {handleChannelMcp} from './mcp/handle-mcp.js';
import {handleOpenclawOutbound} from './plugins/agent/openclaw/outbound.js';
import {ensurePluginsRegistered} from './plugins/register.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

export async function handleFetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    return runWithLogContext({env, waitUntil: (promise) => ctx.waitUntil(promise)}, async () => {
        ensurePluginsRegistered();

        const url = new URL(request.url);
        const pathname = url.pathname;

        if (pathname === '/' || pathname === '/health') {
            return json({status: 'ok', service: 'xchatbot'});
        }

        if (
            pathname === '/webhook/wechat'
            || pathname.startsWith('/webhook/wechat/')
            || pathname === '/adapter/golem/webhook'
        ) {
            return handleGolemWebhook(request, env, ctx);
        }

        if (pathname === '/adapter/web' || pathname.startsWith('/adapter/web/')) {
            return handleWebAdapter(request, env, ctx);
        }

        if (pathname === '/openclaw/outbound') {
            return handleOpenclawOutbound(request, env);
        }
        if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
            return handleChannelMcp(request, env);
        }

        return new Response('Not Found', {status: 404});
    });
}
