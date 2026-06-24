import type {Env} from '../types/env.js';
import {authorizeAdmin} from '../middleware/auth.js';
import {clearRulesCache, getRulesCacheSize} from '../plugins/rule-engine/rule-sources';
import {RuleDefinitionRepository} from '../plugins/rule-engine/repository.js';
import {
    KV_COMMON_BASE_RULES,
    KV_COMMON_DYNAMIC_RULES,
} from '../constants/kv.js';

export async function handleAdminPlugins(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === '/admin/plugins') {
        const [baseRaw, dynamicRaw, d1Stats] = await Promise.all([
            env.XBOT_KV.get(KV_COMMON_BASE_RULES),
            env.XBOT_KV.get(KV_COMMON_DYNAMIC_RULES),
            RuleDefinitionRepository.getRuleStoreStats(env),
        ]);

        const inlineBase = (env.COMMON_PLUGINS_CONFIG || env.COMMON_PLUGINS_MAPPING || '').trim();
        return new Response(JSON.stringify({
            sources: {
                priority: ['inline', 'kv', 'd1'],
                inline: {
                    baseConfigured: Boolean(inlineBase),
                },
                kv: {
                    base: {key: KV_COMMON_BASE_RULES, configured: Boolean(baseRaw?.trim()), size: baseRaw?.length ?? 0},
                    dynamic: {key: KV_COMMON_DYNAMIC_RULES, configured: Boolean(dynamicRaw?.trim()), size: dynamicRaw?.length ?? 0},
                },
                d1: {
                    available: d1Stats.available,
                    total: d1Stats.total,
                    common: d1Stats.common,
                    dynamic: d1Stats.dynamic,
                },
                cacheMs: env.COMMON_PLUGINS_CACHE_MS?.trim() || '60000(default)',
            },
            cache: {
                entries: getRulesCacheSize(),
            },
            tips: 'POST /admin/plugins/reload 可清空插件规则缓存；KV→D1 一次性迁移请用 node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote',
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }

    if (request.method === 'GET' && pathname === '/admin/plugins/raw') {
        const [baseRaw, dynamicRaw, baseD1Raw, dynamicD1Raw] = await Promise.all([
            env.XBOT_KV.get(KV_COMMON_BASE_RULES),
            env.XBOT_KV.get(KV_COMMON_DYNAMIC_RULES),
            RuleDefinitionRepository.listLegacyRulesByCategory(env, 'common'),
            RuleDefinitionRepository.listLegacyRulesByCategory(env, 'dynamic'),
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
            },
            values: {
                d1: {
                    base: {
                        configured: Array.isArray(baseD1Raw),
                        size: Array.isArray(baseD1Raw) ? baseD1Raw.length : 0,
                        raw: Array.isArray(baseD1Raw) ? toDisplay(JSON.stringify(baseD1Raw, null, 2)) : null,
                    },
                    dynamic: {
                        configured: Array.isArray(dynamicD1Raw),
                        size: Array.isArray(dynamicD1Raw) ? dynamicD1Raw.length : 0,
                        raw: Array.isArray(dynamicD1Raw) ? toDisplay(JSON.stringify(dynamicD1Raw, null, 2)) : null,
                    },
                },
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
                ? '当前返回 full=1 的完整内容，注意可能较大；D1 目前承载 common / dynamic。'
                : '默认仅返回前 300 字符预览，追加 ?full=1 可查看完整内容；追加 ?key=你的KV键 可探测任意键。',
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }

    if (request.method === 'POST' && pathname === '/admin/plugins/reload') {
        const cleared = clearRulesCache() + RuleDefinitionRepository.clearCache();
        return new Response(JSON.stringify({
            ok: true,
            clearedEntries: cleared,
            nowEntries: getRulesCacheSize(),
        }, null, 2), {
            headers: {'Content-Type': 'application/json'},
        });
    }

    return new Response('Not Found', {status: 404});
}

