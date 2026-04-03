import {handleWechat} from './wechat/index.js';
import type {Env} from './types/message.js';
import {clearRemoteRulesCache, getRemoteRulesCacheSize} from './plugins/common/remote-config.js';

// ── KV Key 常量 ──
const KV_DEBUG_ENABLED = 'debug:forward:enabled';
const KV_DEBUG_URL     = 'debug:forward:url';
const KV_COMMON_BASE_RULES = 'plugins:common:mapping';
const KV_COMMON_DYNAMIC_RULES = 'plugins:parameterized:mapping';
const KV_COMMON_WORKFLOW_RULES = 'plugins:workflow:mapping';

// 调试开关默认 TTL：8 小时（单位：秒）。超时后 KV 自动删除，转发自动关闭。
const DEBUG_TTL_SECONDS = 8 * 60 * 60;

// 防递归标识头：转发请求时携带此头，Workers 收到后跳过调试转发直接处理
const DEBUG_FORWARDED_HEADER = 'x-xchatbot-debug-forwarded';

// ── 管理接口鉴权 Token 的 KV Key ──
// 通过 `wrangler secret put ADMIN_TOKEN` 设置，或放在 .dev.vars
// 未配置时管理接口不可用

function isTruthyFlag(value?: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

/** 管理接口统一鉴权：校验 Authorization: Bearer <ADMIN_TOKEN>。 */
function authorizeAdmin(request: Request, env: Env): Response | null {
    const adminToken = env.ADMIN_TOKEN?.trim();
    if (!adminToken) return null;

    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token === adminToken) return null;

    return new Response(JSON.stringify({error: 'Unauthorized'}), {
        status: 401,
        headers: {'Content-Type': 'application/json'},
    });
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

/** 将请求原封不动转发到调试地址（附加防递归标识头） */
async function forwardDebugRequest(request: Request, debugUrl: string): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const targetBase  = new URL(debugUrl);
    const targetUrl   = new URL(incomingUrl.pathname + incomingUrl.search, targetBase);

    // 复制原始请求头，并加入防递归标识
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
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

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

    // POST /admin/debug/enable → 开启（TTL 自动过期）
    if (request.method === 'POST' && pathname.endsWith('/enable')) {
        let forwardUrl = '';
        let ttl = DEBUG_TTL_SECONDS;
        try {
            const body = await request.json() as { url?: string; ttl?: number };
            forwardUrl = body?.url?.trim() ?? '';
            // 支持自定义 TTL（秒），范围 60s ~ 24h
            if (body?.ttl && body.ttl >= 60 && body.ttl <= 86400) {
                ttl = body.ttl;
            }
        } catch {
            // body 非 JSON 时忽略
        }

        // enabled 设置 TTL，到期自动删除 → 转发自动关闭
        await env.XBOT_KV.put(KV_DEBUG_ENABLED, 'true', {expirationTtl: ttl});
        if (forwardUrl) {
            // URL 同步设置相同 TTL
            await env.XBOT_KV.put(KV_DEBUG_URL, forwardUrl, {expirationTtl: ttl});
        }

        const saved = await env.XBOT_KV.get(KV_DEBUG_URL);
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        return new Response(JSON.stringify({
            ok:        true,
            enabled:   true,
            url:       saved ?? '',
            expiresAt,
            ttlSeconds: ttl,
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

/** 插件管理接口：查看配置来源状态 & 刷新规则缓存。 */
async function handleAdminPlugins(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === '/admin/plugins') {
        const [baseRaw, dynamicRaw, workflowRaw] = await Promise.all([
            env.XBOT_KV.get(KV_COMMON_BASE_RULES),
            env.XBOT_KV.get(KV_COMMON_DYNAMIC_RULES),
            env.XBOT_KV.get(KV_COMMON_WORKFLOW_RULES),
        ]);

        const inlineBase = (env.COMMON_PLUGINS_CONFIG || env.COMMON_PLUGINS_MAPPING || '').trim();
        return new Response(JSON.stringify({
            sources: {
                priority: ['inline', 'kv', 'remote'],
                inline: {
                    baseConfigured: Boolean(inlineBase),
                },
                kv: {
                    base: {key: KV_COMMON_BASE_RULES, configured: Boolean(baseRaw?.trim()), size: baseRaw?.length ?? 0},
                    dynamic: {key: KV_COMMON_DYNAMIC_RULES, configured: Boolean(dynamicRaw?.trim()), size: dynamicRaw?.length ?? 0},
                    workflow: {key: KV_COMMON_WORKFLOW_RULES, configured: Boolean(workflowRaw?.trim()), size: workflowRaw?.length ?? 0},
                },
                remote: {
                    configUrlConfigured: Boolean(env.COMMON_PLUGINS_CONFIG_URL?.trim()),
                    baseClientIdConfigured: Boolean(env.COMMON_PLUGINS_CLIENT_ID?.trim()),
                    dynamicClientIdConfigured: Boolean(env.COMMON_DYNAMIC_PLUGINS_CLIENT_ID?.trim() || env.COMMON_ADVANCED_PLUGINS_CLIENT_ID?.trim()),
                    workflowClientIdConfigured: Boolean(env.COMMON_WORKFLOW_PLUGINS_CLIENT_ID?.trim()),
                    cacheMs: env.COMMON_PLUGINS_CACHE_MS?.trim() || '60000(default)',
                },
            },
            cache: {
                entries: getRemoteRulesCacheSize(),
            },
            tips: 'POST /admin/plugins/reload 可清空插件规则缓存，下一次消息触发时会重新加载配置',
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }

    if (request.method === 'GET' && pathname === '/admin/plugins/raw') {
        const [baseRaw, dynamicRaw, workflowRaw] = await Promise.all([
            env.XBOT_KV.get(KV_COMMON_BASE_RULES),
            env.XBOT_KV.get(KV_COMMON_DYNAMIC_RULES),
            env.XBOT_KV.get(KV_COMMON_WORKFLOW_RULES),
        ]);

        const includeFullRaw = url.searchParams.get('full') === '1';
        const probeKey = (url.searchParams.get('key') ?? '').trim();
        const probeRaw = probeKey ? await env.XBOT_KV.get(probeKey) : null;
        const previewSize = 300;
        const toDisplay = (value: string | null) => {
            if (!value) return null;
            if (includeFullRaw) return value;
            return value.length > previewSize
                ? `${value.slice(0, previewSize)}...(truncated)`
                : value;
        };

        return new Response(JSON.stringify({
            keys: {
                base: KV_COMMON_BASE_RULES,
                dynamic: KV_COMMON_DYNAMIC_RULES,
                workflow: KV_COMMON_WORKFLOW_RULES,
            },
            values: {
                base: {
                    configured: Boolean(baseRaw?.trim()),
                    size: baseRaw?.length ?? 0,
                    raw: toDisplay(baseRaw),
                },
                dynamic: {
                    configured: Boolean(dynamicRaw?.trim()),
                    size: dynamicRaw?.length ?? 0,
                    raw: toDisplay(dynamicRaw),
                },
                workflow: {
                    configured: Boolean(workflowRaw?.trim()),
                    size: workflowRaw?.length ?? 0,
                    raw: toDisplay(workflowRaw),
                },
                probe: probeKey
                    ? {
                        key: probeKey,
                        configured: Boolean(probeRaw?.trim()),
                        size: probeRaw?.length ?? 0,
                        raw: toDisplay(probeRaw),
                    }
                    : null,
            },
            tips: includeFullRaw
                ? '当前返回 full=1 的完整 KV 内容，注意可能较大。'
                : '默认仅返回前 300 字符预览，追加 ?full=1 可查看完整内容；追加 ?key=你的KV键 可探测任意键。',
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }

    if (request.method === 'POST' && pathname === '/admin/plugins/reload') {
        const cleared = clearRemoteRulesCache();
        return new Response(JSON.stringify({
            ok: true,
            clearedEntries: cleared,
            nowEntries: getRemoteRulesCacheSize(),
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
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

        // ── 管理接口（插件配置）──
        if (pathname === '/admin/plugins' || pathname.startsWith('/admin/plugins/')) {
            return handleAdminPlugins(request, env);
        }

        // ── 防递归：已经是转发过来的请求，直接正常处理 ──
        if (request.headers.get(DEBUG_FORWARDED_HEADER)) {
            // 跳过调试转发，走正常流程
        } else {
            // ── 从 KV 读取调试转发配置 ──
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
