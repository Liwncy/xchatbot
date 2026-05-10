/** 关键词匹配器 */

import {xuanxueRules} from '../rules.js';
import type {XuanxueMatchContext, XuanxueRule} from '../types.js';

function toKeywords(value: string | string[]): string[] {
    return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

export function findMatch(content: string): XuanxueMatchContext | null {
    for (const rule of xuanxueRules) {
        if (rule.enabled === false) continue;
        const matchMode = rule.matchMode ?? 'exact';
        const keywords = toKeywords(rule.keyword);

        for (const keyword of keywords) {
            if (matchMode === 'exact' && content === keyword) {
                return {rule, keyword, query: ''};
            }
            if (matchMode === 'prefix' && content.startsWith(keyword)) {
                return {rule, keyword, query: content.slice(keyword.length).trim()};
            }
        }
    }
    return null;
}

export function buildTemplateParams(
    message: {content?: string; from: string; senderName?: string; room?: {id: string}; timestamp: number},
    ctx: XuanxueMatchContext,
): Record<string, string> {
    return {
        keyword: ctx.keyword,
        query: ctx.query,
        content: (message.content ?? '').trim(),
        from: message.from,
        senderName: message.senderName ?? '',
        roomId: message.room?.id ?? '',
    };
}

export function extractArgs(rule: XuanxueRule, query: string): Record<string, string> {
    const config = rule.args;
    if (!config) return {};

    const names = config.names ?? [];
    const required = config.required ?? [];
    const mode = config.mode ?? 'split';
    const out: Record<string, string> = {};

    if (mode === 'regex') {
        if (!config.pattern) throw new Error('参数提取缺少 regex pattern');
        const reg = new RegExp(config.pattern, config.flags ?? '');
        const match = query.match(reg);
        if (!match) throw new Error('参数提取失败：输入格式不匹配');
        names.forEach((name, idx) => {
            out[name] = (match[idx + 1] ?? '').trim();
        });
    } else {
        const chunks = query
            .split(config.delimiter ?? /\s+/)
            .map((item) => item.trim())
            .filter(Boolean);
        names.forEach((name, idx) => {
            out[name] = chunks[idx] ?? '';
        });
    }

    for (const key of required) {
        if (!out[key]) throw new Error(`缺少必填参数：${key}`);
    }

    return out;
}

export function normalizeParamsByConvention(params: Record<string, string>): Record<string, string> {
    const out = {...params};

    if (out.sex) {
        const original = out.sex.trim();
        const sexMap: Record<string, string> = {
            男: 'male', male: 'male', m: 'male',
            女: 'female', female: 'female', f: 'female',
        };
        out.sexInput = original;
        out.sex = sexMap[original] ?? out.sex;
    }

    if (out.type) {
        const original = out.type.trim();
        const typeMap: Record<string, string> = {
            公历: 'gongli', 阳历: 'gongli', gongli: 'gongli', solar: 'gongli',
            农历: 'nongli', 阴历: 'nongli', nongli: 'nongli', lunar: 'nongli',
        };
        out.typeInput = original;
        out.type = typeMap[original] ?? out.type;
    }

    for (const field of ['male_type', 'female_type'] as const) {
        if (out[field]) {
            const original = out[field].trim();
            const typeMap: Record<string, string> = {
                公历: 'gongli', 阳历: 'gongli', gongli: 'gongli',
                农历: 'nongli', 阴历: 'nongli', nongli: 'nongli',
            };
            out[`${field}Input`] = original;
            out[field] = typeMap[original] ?? out[field];
        }
    }

    return out;
}

