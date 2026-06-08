/** 大六壬排盘 HTML 解析器 */

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
    const normalized = input
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*\/p\s*>/gi, '\n')
        .replace(/<\s*\/li\s*>/gi, '\n');
    return stripHtml(normalized);
}

function parsePreviewImageUrl(html: string): string | undefined {
    const match = html.match(/<img[^>]*src="([^"]+)"/i);
    const src = match?.[1]?.trim() ?? '';
    if (!src) return undefined;
    if (/^https?:\/\//i.test(src)) return src;
    if (src.startsWith('//')) return `https:${src}`;
    if (src.startsWith('/')) return `https://store.yuanfenju.com${src}`;
    return `https://store.yuanfenju.com/${src.replace(/^\/+/, '')}`;
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
        .map((line) => normalizeBasicValue(line).trim())
        .filter(Boolean);

    return lines.slice(0, 12);
}

function parseParagraphs(block: string): string[] {
    const out: string[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(block)) !== null) {
        const text = normalizeBasicValue(stripHtmlWithLineBreaks(m[1])).trim();
        if (text) out.push(text);
    }
    return out;
}

function parseTables(block: string): string[] {
    const lines: string[] = [];
    const tableReg = /<table[^>]*>[\s\S]*?<\/table>/gi;
    let tableMatch: RegExpExecArray | null;
    let tableCount = 0;
    while ((tableMatch = tableReg.exec(block)) !== null) {
        tableCount += 1;
        if (tableCount > 2) break;

        const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr: RegExpExecArray | null;
        let rowCount = 0;
        while ((tr = trReg.exec(tableMatch[0])) !== null) {
            rowCount += 1;
            if (rowCount > 18) break;

            const cells: string[] = [];
            const tdReg = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
            let td: RegExpExecArray | null;
            while ((td = tdReg.exec(tr[1])) !== null) {
                const value = normalizeBasicValue(stripHtmlWithLineBreaks(td[1])).replace(/\s+/g, ' ').trim();
                if (value) cells.push(value);
            }
            if (cells.length > 0) {
                lines.push(cells.join(' ｜ '));
            }
        }
    }
    return lines;
}

function parseSection(fragment: string, title: string, maxLines = 24): XuanxueSection | null {
    const marker = `<div class="panel-heading"><strong>${title}</strong></div>`;
    const start = fragment.indexOf(marker);
    if (start < 0) return null;

    const contentStart = start + marker.length;
    const nextHeading = fragment.indexOf('<div class="panel-heading"><strong>', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    const paragraphLines = parseParagraphs(block);
    const tableLines = parseTables(block);
    const merged = [...paragraphLines, ...tableLines].filter(Boolean);
    if (merged.length === 0) return null;

    return {
        title,
        content: merged.slice(0, maxLines).map((line) => `• ${line}`).join('\n'),
    };
}

export function parseDaliurenHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const sections: XuanxueSection[] = [];

    const targets: Array<{ title: string; maxLines?: number }> = [
        {title: '大六壬天地神盘', maxLines: 28},
        {title: '大六壬四课', maxLines: 16},
        {title: '大六壬三传', maxLines: 16},
        {title: '大六壬简批', maxLines: 20},
    ];

    for (const item of targets) {
        const parsed = parseSection(fragment, item.title, item.maxLines ?? 24);
        if (parsed) sections.push(parsed);
    }

    return {
        summary,
        sections,
        previewImageUrl: parsePreviewImageUrl(fragment),
    };
}

