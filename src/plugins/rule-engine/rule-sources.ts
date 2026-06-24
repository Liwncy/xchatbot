import {logger} from '../../utils/logger';

interface RuleSourceOptions<T> {
    /** 区分不同引擎的缓存命名空间，避免互相污染。 */
    cacheNamespace: string;
    /** 内联配置文本（优先级最高）。 */
    inlineConfig?: string;
    /** KV 命名空间（次优先级）。 */
    kv?: KVNamespace;
    /** KV 中的规则 key。 */
    kvKey?: string;
    /** KV 规则缓存时长（毫秒）。 */
    cacheMs?: number;
    /** 原始配置文本解析函数。 */
    parseRules: (rawText: string) => T[];
    /** 日志前缀，便于快速定位来源。 */
    logPrefix: string;
}

interface CacheEntry {
    expiresAt: number;
    rules: unknown[];
}

const DEFAULT_CACHE_MS = 60_000;
const rulesCache = new Map<string, CacheEntry>();

/** 管理接口使用：清空 KV 规则内存缓存，下一次请求会重新加载。 */
export function clearRulesCache(): number {
    const size = rulesCache.size;
    rulesCache.clear();
    return size;
}

/** 管理接口使用：获取当前内存缓存条目数量。 */
export function getRulesCacheSize(): number {
    return rulesCache.size;
}

function parseRulesSafely<T>(rawText: string, parseRules: (rawText: string) => T[], logPrefix: string): T[] {
    try {
        return parseRules(rawText);
    } catch (err) {
        logger.error(`${logPrefix}规则解析异常`, err);
        return [];
    }
}

/**
 * 统一规则加载顺序：inline > KV。
 */
export async function loadRulesFromSources<T>(options: RuleSourceOptions<T>): Promise<T[]> {
    const inlineConfig = options.inlineConfig?.trim();
    if (inlineConfig) {
        return parseRulesSafely(inlineConfig, options.parseRules, options.logPrefix);
    }

    const kvKey = options.kvKey?.trim();
    if (options.kv && kvKey) {
        const configuredCacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
        const cacheMs = Number.isFinite(configuredCacheMs) ? Math.max(0, configuredCacheMs) : DEFAULT_CACHE_MS;
        const cacheEnabled = cacheMs > 0;
        const cacheKey = `${options.cacheNamespace}|kv|${kvKey}`;
        const now = Date.now();
        if (cacheEnabled) {
            const cached = rulesCache.get(cacheKey);
            if (cached && now < cached.expiresAt) {
                return cached.rules as T[];
            }
        }

        try {
            const rawText = await options.kv.get(kvKey);
            if (rawText?.trim()) {
                const rules = parseRulesSafely(rawText, options.parseRules, options.logPrefix);
                if (cacheEnabled) {
                    rulesCache.set(cacheKey, {rules, expiresAt: now + cacheMs});
                }
                return rules;
            }
        } catch (err) {
            logger.error(`${options.logPrefix}KV 配置加载异常`, {kvKey, error: err});
        }
    }

    return [];
}
