import type {Env} from '../types/message.js';
import {authorizeAdmin} from '../middleware/auth.js';
import {clearRemoteRulesCache, getRemoteRulesCacheSize} from '../plugins/common/remote-config.js';
import {
    KV_COMMON_BASE_RULES,
    KV_COMMON_DYNAMIC_RULES,
    KV_COMMON_WORKFLOW_RULES,
} from '../constants/kv.js';

export async function handleAdminPlugins(request: Request, env: Env): Promise<Response> {
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

