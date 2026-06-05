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
export function normalizeRuleConfigText(raw: string | undefined): string {
    return (raw ?? '').replace(/^\uFEFF/, '').trim();
}

export function parseRuleConfigList(raw: string | undefined): unknown[] {
    const source = normalizeRuleConfigText(raw);
    if (!source) return [];

    const parsed = JSON.parse(source) as unknown;
    const list = Array.isArray(parsed)
        ? parsed
        : (parsed as {keywordMapping?: unknown})?.keywordMapping;

    if (!Array.isArray(list)) {
        throw new Error('配置不是数组/keywordMapping');
    }

    return list;
}

export function createCachedRuleParser<T>(options: ParserOptions<T>): (raw: string | undefined) => T[] {
    let cachedRaw = '';
    let cachedRules: T[] = [];

    return (raw: string | undefined): T[] => {
        const source = normalizeRuleConfigText(raw);
        if (!source) return [];
        if (source === cachedRaw) return cachedRules;

        try {
            const list = parseRuleConfigList(source);

            cachedRaw = source;
            cachedRules = list
                .map((item) => (item && typeof item === 'object' ? options.mapItem(item as Record<string, unknown>) : null))
                .filter((item): item is T => Boolean(item));

            return cachedRules;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const logMethod = message === '配置不是数组/keywordMapping' ? logger.warn : logger.error;
            logMethod(`${options.logPrefix}${message === '配置不是数组/keywordMapping' ? message : '配置 JSON 解析失败'}`, message === '配置不是数组/keywordMapping' ? undefined : err);
            cachedRaw = source;
            cachedRules = [];
            return cachedRules;
        }
    };
}

