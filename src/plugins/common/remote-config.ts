import {logger} from '../../utils/logger';

interface RemoteRulesOptions<T> {
    /** 区分不同引擎的缓存命名空间，避免互相污染。 */
    cacheNamespace: string;
    /** 远程配置地址。为空时返回空规则。 */
    remoteUrl?: string;
    /** 请求头 clientid。 */
    clientId?: string;
    /** 远程配置缓存时长（毫秒）。 */
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
const remoteRulesCache = new Map<string, CacheEntry>();

/**
 * 统一拉取远程规则并做短缓存。
 *
 * 所有通用插件引擎都复用此方法，避免重复维护请求/缓存/异常处理逻辑。
 */
export async function loadRemoteRules<T>(options: RemoteRulesOptions<T>): Promise<T[]> {
    const remoteUrl = options.remoteUrl?.trim();
    if (!remoteUrl) return [];

    const clientId = options.clientId?.trim() ?? '';
    const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
    const cacheKey = `${options.cacheNamespace}|${remoteUrl}|${clientId}`;
    const now = Date.now();

    const cached = remoteRulesCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
        return cached.rules as T[];
    }

    try {
        const headers: Record<string, string> = {};
        if (clientId) headers.clientid = clientId;

        const response = await fetch(remoteUrl, {method: 'GET', headers});
        if (!response.ok) {
            logger.error(`${options.logPrefix}远程配置请求失败`, {status: response.status, url: remoteUrl});
            return [];
        }

        const rawText = await response.text();
        const rules = options.parseRules(rawText);
        remoteRulesCache.set(cacheKey, {rules, expiresAt: now + cacheMs});
        return rules;
    } catch (err) {
        logger.error(`${options.logPrefix}远程配置加载异常`, err);
        return [];
    }
}

