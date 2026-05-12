/** 星座今日运势 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

const SUMMARY_KEYS = new Set([
    '速配星座', '提防星座', '幸运颜色', '幸运数字', '幸运宝石',
    '综合分数', '爱情分数', '事业分数', '财富分数', '健康分数',
]);

const SECTION_KEYS = ['今日运势', '爱情运势', '事业运势', '财富运势', '健康运势'];

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function extractResultFragment(page: string): string {
    const start = page.indexOf('今日运势');
    if (start < 0) return page;

    const end1 = page.indexOf('返回重测', start);
    const end2 = page.indexOf('返回重排', start);
    const end3 = page.indexOf('最新文章', start);
    const candidates = [end1, end2, end3].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 200000);
    return page.slice(start, end);
}

export function parseXingzuoDailyHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);

    const summaryMap = new Map<string, string>();
    const sectionMap = new Map<string, string>();

    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(fragment)) !== null) {
        const raw = stripHtmlWithBreaks(m[1]).replace(/\s+/g, ' ').trim();
        const line = normalizeBasicValue(raw);
        const kv = line.match(/^【([^】]+)】\s*(.*)$/);
        if (!kv) continue;

        const key = kv[1].trim();
        const value = kv[2].trim();
        if (!key || !value) continue;

        if (SUMMARY_KEYS.has(key)) {
            if (!summaryMap.has(key)) summaryMap.set(key, value);
            continue;
        }

        if (SECTION_KEYS.includes(key)) {
            if (!sectionMap.has(key)) sectionMap.set(key, value);
        }
    }

    const summary: string[] = [];
    const sections: XuanxueSection[] = [];

    // 从标题提取星座名，便于摘要第一行显示
    const titleMatch = fragment.match(/([\u4e00-\u9fa5]{2,4}座)今日运势/);
    if (titleMatch) {
        summary.unshift(`星座：${titleMatch[1]}`);
    }

    for (const key of [
        '速配星座', '提防星座', '幸运颜色', '幸运数字', '幸运宝石',
        '综合分数', '爱情分数', '事业分数', '财富分数', '健康分数',
    ]) {
        const v = summaryMap.get(key);
        if (v) summary.push(`【${key}】${v}`);
    }

    for (const key of SECTION_KEYS) {
        const v = sectionMap.get(key);
        if (v) sections.push({title: key, content: v});
    }

    return {
        summary,
        sections,
    };
}

