/** 八字测算 / 八字精算 HTML 解析器 */

import {stripHtml, escapeRegExp, normalizeBasicValue} from '../lib/html.js';

export interface XuanxueSection {
    title: string;
    content: string;
}

export interface BaziParsedResult {
    summary: string[];
    sections: XuanxueSection[];
}

const BAZI_SUMMARY_LABELS = [
    '缘主姓名：',
    '出生公历：',
    '出生农历：',
    '八字生辰：',
    '八字格局：',
    '星宿信息：',
    '命卦信息：',
    '五行旺度：',
    '起运信息：',
];

function pickBasicLine(html: string, label: string): string | null {
    const labelPattern = escapeRegExp(label);
    const reg = new RegExp(
        `<p[^>]*>\\s*<strong[^>]*>\\s*${labelPattern}\\s*<\\/strong>\\s*([\\s\\S]*?)<\\/p>`,
        'i',
    );
    const match = html.match(reg);
    const value = normalizeBasicValue(stripHtml(match?.[1] ?? ''));
    return value ? `${label}${value}` : null;
}

export function parseBaziHtml(page: string): BaziParsedResult {
    const resultRoot =
        page.match(/<h3 class="panel-title">[\s\S]*?八字(?:测算|精算)结果[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0] ?? page;

    const summary: string[] = [];
    for (const label of BAZI_SUMMARY_LABELS) {
        const line = pickBasicLine(resultRoot, label);
        if (line) summary.push(line);
    }

    const sections: XuanxueSection[] = [];
    const sectionReg =
        /<div class="panel-heading">\s*<strong>([^<]+)<\/strong>\s*<\/div>\s*<div class="panel-body">([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = sectionReg.exec(resultRoot)) !== null) {
        const title = stripHtml(match[1]);
        const content = stripHtml(match[2]).replace(/\s*\n\s*/g, '\n');
        if (!title || !content) continue;
        sections.push({title, content});
    }

    const filtered = sections.filter((item) => item.title !== '基本信息');
    return {summary, sections: filtered.slice(0, 10)};
}

