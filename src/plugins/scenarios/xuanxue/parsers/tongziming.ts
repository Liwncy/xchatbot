/** 童子命查询 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult} from './bazi.js';

const SUMMARY_LABELS = [
    '缘主姓名：',
    '出生公历：',
    '出生农历：',
    '八字生辰：',
    '年柱纳音：',
    '查询结果：',
];

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function extractResultFragment(page: string): string {
    const marker = '<div class="panel-heading"><strong>查询结果</strong></div>';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    const end1 = page.indexOf('返回重查', start);
    const end2 = page.indexOf('返回重测', start);
    const end3 = page.indexOf('最新文章', start);
    const candidates = [end1, end2, end3].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 200000);
    return page.slice(start, end);
}

export function parseTongzimingHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);

    const lines = stripHtmlWithBreaks(fragment)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const summary = SUMMARY_LABELS
        .map((label) => lines.find((line) => line.startsWith(label)))
        .filter((line): line is string => Boolean(line));

    const queryResult = summary.find((s) => s.startsWith('查询结果：'))?.replace(/^查询结果：\s*/, '').trim();

    return {
        summary,
        sections: queryResult ? [{title: '查询结果', content: queryResult}] : [],
    };
}

