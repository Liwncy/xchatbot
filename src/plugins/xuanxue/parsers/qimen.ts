/** 奇门排盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    const end1 = page.indexOf('返回重排', start);
    const end2 = page.indexOf('测算告诫', start);
    const candidates = [end1, end2].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 220000);
    return page.slice(start, end);
}

function stripHtmlWithLineBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function parseBasicSummary(fragment: string): string[] {
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];

    const contentStart = bodyStart + '<div class="panel-body">'.length;
    const nextPanel = fragment.indexOf('<div class="panel panel-default">', contentStart);
    const end = nextPanel > contentStart ? nextPanel : fragment.length;
    const block = fragment.slice(contentStart, end);

    const lines = stripHtmlWithLineBreaks(block)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return lines;
}

function parseQimenPanSummary(fragment: string): XuanxueSection | null {
    const markers = [
        {marker: '<div class="panel-heading"><strong>奇门遁甲盘</strong></div>', title: '奇门遁甲盘'},
        {marker: '<div class="panel-heading"><strong>阴盘奇门盘</strong></div>', title: '阴盘奇门盘'},
    ];

    const found = markers
        .map((item) => ({...item, idx: fragment.indexOf(item.marker)}))
        .filter((item) => item.idx >= 0)
        .sort((a, b) => a.idx - b.idx)[0];

    const start = found?.idx ?? -1;
    if (start < 0) return null;

    const tableStart = fragment.indexOf('<table', start);
    const tableEnd = tableStart > -1 ? fragment.indexOf('</table>', tableStart) : -1;
    if (tableStart < 0 || tableEnd < 0) return null;

    const tableBlock = fragment.slice(tableStart, tableEnd + 8);
    const tdReg = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td: RegExpExecArray | null;

    const lines: string[] = [];
    while ((td = tdReg.exec(tableBlock)) !== null) {
        const textLines = stripHtmlWithLineBreaks(td[1])
            .split('\n')
            .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        if (textLines.length === 0) continue;

        const palaceLine = textLines.find((line) => /[乾坤艮震巽离坎兑中]/.test(line));
        const gateLine = textLines.find((line) => line.includes('门'));
        const starLine = textLines.find((line) => /天[蓬任冲辅英芮柱心禽]/.test(line));
        const godLine = textLines.find((line) => /(值符|腾蛇|螣蛇|太阴|六合|白虎|玄武|九地|九天|朱雀|勾陈|太常)/.test(line));

        if (!palaceLine && !gateLine && !starLine) continue;

        const palace = palaceLine ? palaceLine.replace(/[^乾坤艮震巽离坎兑中]/g, '') || palaceLine : '未知宫';
        const parts = [
            starLine ? `星:${starLine}` : '',
            gateLine ? `门:${gateLine}` : '',
            godLine ? `神:${godLine}` : '',
        ].filter(Boolean);

        lines.push(`${palace}宫｜${parts.join(' ｜ ')}`);
    }

    if (lines.length === 0) return null;

    const unique = Array.from(new Set(lines));
    return {
        title: found?.title ?? '奇门遁甲盘',
        content: unique.join('\n'),
    };
}

function parseJianpiSection(fragment: string): XuanxueSection | null {
    const marker = '<div class="panel-heading"><strong>排盘简批</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return null;

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return null;
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const end = fragment.indexOf('<div style="text-align:center;">', contentStart);
    const block = fragment.slice(contentStart, end > contentStart ? end : fragment.length);

    const sections: string[] = [];
    const segReg = /<p>\s*<strong>([^<]+)：<\/strong>([\s\S]*?)(?=<hr>|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = segReg.exec(block)) !== null) {
        const title = normalizeBasicValue(stripHtml(m[1])).trim();
        const content = normalizeBasicValue(stripHtmlWithLineBreaks(m[2])).replace(/\s+/g, ' ').trim();
        if (!title || !content) continue;
        sections.push(`【${title}】${content}`);
    }

    // 兜底：若结构不稳定，直接抽取全部文本
    if (sections.length === 0) {
        const text = normalizeBasicValue(stripHtmlWithLineBreaks(block)).replace(/\s+/g, ' ').trim();
        if (!text) return null;
        return {title: '排盘简批', content: text};
    }

    return {
        title: '排盘简批',
        content: sections.join('\n\n'),
    };
}

export function parseQimenHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const sections: XuanxueSection[] = [];

    const pan = parseQimenPanSummary(fragment);
    if (pan) sections.push(pan);

    const jianpi = parseJianpiSection(fragment);
    if (jianpi) sections.push(jianpi);

    return {summary, sections};
}

