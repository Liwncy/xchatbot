import {logger} from '../../utils/logger';

interface ParserOptions<T> {
    /** 日志前缀，用于区分不同引擎。 */
    logPrefix: string;
    /** 将单条配置映射为目标规则；返回 null 表示忽略该条。 */
    mapItem: (item: Record<string, unknown>) => T | null;
}

/**
 * 创建带内联缓存的规则解析器。
 *
 * - 支持数组或 `{ keywordMapping: [] }` 结构
 * - 输入字符串未变化时复用上次解析结果
 */
export function createCachedRuleParser<T>(options: ParserOptions<T>): (raw: string | undefined) => T[] {
    let cachedRaw = '';
    let cachedRules: T[] = [];

    return (raw: string | undefined): T[] => {
        const source = (raw ?? '').trim();
        if (!source) return [];
        if (source === cachedRaw) return cachedRules;

        try {
            const parsed = JSON.parse(source) as unknown;
            const list = Array.isArray(parsed)
                ? parsed
                : (parsed as { keywordMapping?: unknown })?.keywordMapping;

            if (!Array.isArray(list)) {
                logger.warn(`${options.logPrefix}配置不是数组/keywordMapping，已忽略`);
                cachedRaw = source;
                cachedRules = [];
                return cachedRules;
            }

            cachedRaw = source;
            cachedRules = list
                .map((item) => (item && typeof item === 'object' ? options.mapItem(item as Record<string, unknown>) : null))
                .filter((item): item is T => Boolean(item));

            return cachedRules;
        } catch (err) {
            logger.error(`${options.logPrefix}配置 JSON 解析失败`, err);
            cachedRaw = source;
            cachedRules = [];
            return cachedRules;
        }
    };
}

