/** 择吉时查询 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult} from './bazi.js';

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n')
            .replace(/<\s*\/tr\s*>/gi, '\n')
            .replace(/<\s*\/td\s*>/gi, ' '),
    );
}

function extractResultFragment(page: string): string {
    // 截取「吉日查询概述」面板到「最新文章」之间的内容
    const marker = '吉日查询概述';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    const endMarkers = ['最新文章', '返回重查', '返回重测'];
    const candidates = endMarkers.map((s) => page.indexOf(s, start)).filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 300000);
    return page.slice(start, end);
}

/** 解析吉日列表表格中的每一行 */
function parseDayRows(fragment: string): string[] {
    const trReg = /<tr>([\s\S]*?)<\/tr>/gi;
    const results: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = trReg.exec(fragment)) !== null) {
        const row = match[1];
        // 提取 th（日期/星期）和 td（宜忌内容）
        const thMatch = /<th>([\s\S]*?)<\/th>/i.exec(row);
        const tdMatch = /<td>([\s\S]*?)<\/td>/i.exec(row);
        if (!thMatch || !tdMatch) continue;

        const dateStr = stripHtmlWithBreaks(thMatch[1])
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .join(' ');

        const content = stripHtmlWithBreaks(tdMatch[1])
            .split('\n')
            .map((s) => normalizeBasicValue(s).replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .filter((s) => !s.startsWith('吉时详情'))
            .join('\n');

        if (dateStr && content) {
            results.push(`📅 ${dateStr}\n${content}`);
        }
    }

    return results;
}

export function parseZeshiHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);

    // 提取概述（"吉日区间：xxx，共计xxx天，其中..."）
    const summaryMatch = /吉日区间[：:][^\n<]+/i.exec(fragment);
    const summaryText = summaryMatch
        ? normalizeBasicValue(summaryMatch[0]).trim()
        : '';

    const dayRows = parseDayRows(fragment);

    return {
        summary: summaryText ? [summaryText] : [],
        sections: dayRows.map((content, i) => ({
            title: `吉日 ${i + 1}`,
            content,
        })),
    };
}

