import type {Env} from './types/env.js';
import {runWithLogContext} from './core/app-log/context.js';
import {handleGolemWebhook} from './adapter/golem/webhook.js';
import {handleWebAdapter} from './adapter/web/webhook.js';
import {handleAdminDebug} from './debug/admin.js';
import {maybeForwardDebug} from './debug/forward.js';
import {handleAdminStatus} from './debug/status.js';
import {handleAgentWs} from './plugins/agent/ws-gateway.js';
import {handleChannelMcp} from './mcp/handle-mcp.js';
import {handleOpenclawOutbound} from './plugins/agent/openclaw/outbound.js';
import {ensureBrainCatalog} from './core/brain-store.js';
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
        const url = new URL(request.url);
        const pathname = url.pathname;

        if (pathname === '/' || pathname === '/health') {
            ctx.waitUntil(ensureBrainCatalog(env));
            return json({status: 'ok', service: 'xchatbot'});
        }

        if (pathname === '/admin/debug' || pathname.startsWith('/admin/debug/')) {
            return handleAdminDebug(request, env);
        }
        if (pathname === '/admin/status') {
            return handleAdminStatus(request, env);
        }
        // WebSocket 要在生产的邮箱上落地，不能被调试转发带去本地。
        if (pathname === '/agent/ws') {
            return handleAgentWs(request, env);
        }

        const forwarded = await maybeForwardDebug(request, env);
        if (forwarded) return forwarded;

        ensurePluginsRegistered();

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
