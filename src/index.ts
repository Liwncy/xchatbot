import {handleWechat} from './wechat/index.js';
import type {Env} from './types/message.js';

// ── KV Key 常量 ──
const KV_DEBUG_ENABLED = 'debug:forward:enabled';
const KV_DEBUG_URL     = 'debug:forward:url';

// ── 管理接口鉴权 Token 的 KV Key ──
// 通过 `wrangler secret put ADMIN_TOKEN` 设置，或放在 .dev.vars
// 未配置时管理接口不可用

function isTruthyFlag(value?: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

/** 从 KV 读取调试转发配置 */
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

/** 将请求原封不动转发到调试地址 */
async function forwardDebugRequest(request: Request, debugUrl: string): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetBase  = new URL(debugUrl);
    const targetUrl   = new URL(incomingUrl.pathname + incomingUrl.search, targetBase);

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

/**
 * 处理 /admin/debug 管理接口。
 *
 * GET  /admin/debug          → 查看当前调试配置
 * POST /admin/debug/enable   → 开启转发（body: { url: "https://..." }）
 * POST /admin/debug/disable  → 关闭转发
 *
 * 需要在请求头携带 Authorization: Bearer <ADMIN_TOKEN>
 * ADMIN_TOKEN 通过 wrangler secret 或 .dev.vars 配置。
 */
async function handleAdminDebug(request: Request, env: Env): Promise<Response> {
    // 鉴权：校验 ADMIN_TOKEN
    const adminToken = env.ADMIN_TOKEN?.trim();
    if (adminToken) {
        const auth = request.headers.get('Authorization') ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        if (token !== adminToken) {
            return new Response(JSON.stringify({error: 'Unauthorized'}), {
                status: 401,
                headers: {'Content-Type': 'application/json'},
            });
        }
    }

    const url      = new URL(request.url);
    const pathname = url.pathname; // e.g. /admin/debug/enable

    // GET /admin/debug → 查看当前状态
    if (request.method === 'GET') {
        const config = await loadDebugConfig(env.XBOT_KV);
        return new Response(JSON.stringify({
            enabled: config.enabled,
            url:     config.url || null,
            tips:    'POST /admin/debug/enable  body:{"url":"..."} 开启转发\nPOST /admin/debug/disable 关闭转发',
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    // POST /admin/debug/enable → 开启
    if (request.method === 'POST' && pathname.endsWith('/enable')) {
        let forwardUrl = '';
        try {
            const body = await request.json() as { url?: string };
            forwardUrl = body?.url?.trim() ?? '';
        } catch {
            // body 非 JSON 时忽略
        }

        await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'true');
        if (forwardUrl) {
            await env.XBOT_KV.put(KV_DEBUG_URL, forwardUrl);
        }

        const saved = await env.XBOT_KV.get(KV_DEBUG_URL);
        return new Response(JSON.stringify({
            ok:      true,
            enabled: true,
            url:     saved ?? '',
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    // POST /admin/debug/disable → 关闭
    if (request.method === 'POST' && pathname.endsWith('/disable')) {
        await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'false');
        return new Response(JSON.stringify({
            ok:      true,
            enabled: false,
        }, null, 2), {headers: {'Content-Type': 'application/json'}});
    }

    return new Response('Not Found', {status: 404});
}

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        const url      = new URL(request.url);
        const pathname = url.pathname;

        // ── 管理接口（调试控制）──
        if (pathname === '/admin/debug' || pathname.startsWith('/admin/debug/')) {
            return handleAdminDebug(request, env);
        }

        // ── 从 KV 读取调试转发配置（无额外延迟，Promise.all 并行）──
        const debugConfig = await loadDebugConfig(env.XBOT_KV);
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

        // ── 微信专用入口 ──
        if (pathname === '/webhook/wechat' || pathname.startsWith('/webhook/wechat/')) {
            return handleWechat(request, env);
        }

        // ── 健康检查 ──
        if (pathname === '/' || pathname === '/health') {
            return new Response(JSON.stringify({status: 'ok', service: 'xchatbot-wechat'}), {
                status:  200,
                headers: {'Content-Type': 'application/json'},
            });
        }

        return new Response('Not Found', {status: 404});
    },
} satisfies ExportedHandler<Env>;
