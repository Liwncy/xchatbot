export type MatchMode = 'contains' | 'prefix' | 'exact' | 'regex';
export type ArgsMode = 'tail' | 'split' | 'regex';

export interface ArgsConfig {
    mode?: ArgsMode;
    delimiter?: string;
    names?: string[];
    required?: string[];
}

export interface MatchableRule {
    keyword?: string | string[];
    pattern?: string;
    matchMode?: MatchMode;
    args?: ArgsConfig;
}

export interface MatchContext<T> {
    rule: T;
    params: Record<string, string>;
}

/** 统一关键词格式，支持 `a|b|c` 简写。 */
export function normalizeKeyword(keyword: string | string[] | undefined): string[] {
    if (!keyword) return [];

    const rawItems = Array.isArray(keyword) ? keyword : [keyword];
    return rawItems
        .flatMap((item) => item.split('|'))
        .map((v) => v.trim())
        .filter(Boolean);
}

/** 标准化匹配模式，默认 contains。 */
export function normalizeMatchMode(mode: string | undefined): MatchMode {
    const m = (mode ?? '').trim().toLowerCase();
    if (m === 'contains' || m === 'prefix' || m === 'exact' || m === 'regex') return m;
    return 'contains';
}

function firstMatchedKeyword(content: string, keywords: string[], mode: MatchMode): string | null {
    if (!keywords.length) return null;
    if (mode === 'contains') return keywords.find((k) => content.includes(k)) ?? null;
    if (mode === 'prefix') return keywords.find((k) => content.startsWith(k)) ?? null;
    if (mode === 'exact') return keywords.find((k) => content === k) ?? null;
    return null;
}

function applyArgsConfig(content: string, matchedKeyword: string, args: ArgsConfig | undefined): Record<string, string> | null {
    const cfg = args ?? {mode: 'tail'};
    const mode = cfg.mode ?? 'tail';
    const names = cfg.names ?? [];
    const required = cfg.required ?? [];

    const tail = content.slice(matchedKeyword.length).trim();
    const params: Record<string, string> = {all: tail};

    if (mode === 'tail') {
        const key = names[0] ?? 'arg1';
        params[key] = tail;
    } else if (mode === 'split') {
        const delimiter = cfg.delimiter && cfg.delimiter.trim() ? cfg.delimiter : /\s+/;
        const parts = tail.split(delimiter).map((s) => s.trim()).filter(Boolean);
        parts.forEach((part, idx) => {
            params[String(idx + 1)] = part;
            if (names[idx]) params[names[idx]] = part;
        });
    }

    if (required.some((key) => !params[key])) return null;
    return params;
}

function buildRegexParams(content: string, rule: MatchableRule): Record<string, string> | null {
    if (!rule.pattern) return null;

    let reg: RegExp;
    try {
        reg = new RegExp(rule.pattern);
    } catch {
        return null;
    }

    const match = content.match(reg);
    if (!match) return null;

    const names = rule.args?.names ?? [];
    const params: Record<string, string> = {all: content};
    match.slice(1).forEach((part, idx) => {
        const value = part ?? '';
        params[String(idx + 1)] = value;
        if (names[idx]) params[names[idx]] = value;
    });

    const required = rule.args?.required ?? [];
    if (required.some((key) => !params[key])) return null;
    return params;
}

/**
 * 在规则列表中查找第一个命中项，并返回提取后的模板参数。
 */
export function findMatchContext<T extends MatchableRule>(
    content: string,
    rules: T[],
): MatchContext<T> | null {
    for (const rule of rules) {
        const mode = rule.matchMode ?? 'contains';

        if (mode === 'regex') {
            const params = buildRegexParams(content, rule);
            if (params) return {rule, params};
            continue;
        }

        const matchedKeyword = firstMatchedKeyword(content, normalizeKeyword(rule.keyword), mode);
        if (!matchedKeyword) continue;

        const params = applyArgsConfig(content, matchedKeyword, rule.args);
        if (!params) continue;

        params.keyword = matchedKeyword;
        return {rule, params};
    }

    return null;
}

