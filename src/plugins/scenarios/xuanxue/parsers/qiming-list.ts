/** 在线起名结果解析器（候选姓名列表） */

import {stripHtml} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    const start = page.indexOf('起名结果');
    if (start < 0) return page;

    const endCandidates = ['仅做演示模板展示', 'yfj-pages', '返回重测', '最新文章']
        .map((s) => page.indexOf(s, start))
        .filter((v) => v > start);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(page.length, start + 300000);
    return page.slice(start, end);
}

function extractNames(page: string): string[] {
    const fragment = extractResultFragment(page);
    const names: string[] = [];
    const seen = new Set<string>();

    const reg = /<a[^>]*id="([^"]+)"[^>]*class="list-group-item left"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = reg.exec(fragment)) !== null) {
        const name = stripHtml(m[1]).replace(/\s+/g, '').trim();
        if (!/^[\u4e00-\u9fa5]{2,6}$/.test(name)) continue;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }

    return names;
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

export function parseQimingListHtml(page: string): BaziParsedResult {
    const names = extractNames(page);
    if (names.length === 0) {
        return {
            summary: ['未解析到起名结果，请稍后重试。'],
            sections: [],
        };
    }

    const summary: string[] = [];
    const surname = names[0].charAt(0);
    if (surname) summary.push(`姓氏：${surname}`);
    summary.push(`候选数量：${names.length}`);
    summary.push(`示例：${names.slice(0, 5).join('、')}`);

    const sections: XuanxueSection[] = chunk(names, 20).map((group, idx) => ({
        title: `起名候选 ${idx + 1}`,
        content: group.map((n) => `• ${n}`).join('\n'),
    }));

    return {summary, sections};
}


