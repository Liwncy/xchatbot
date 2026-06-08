/** 八字流年财运分析 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

const EMPTY_PLACEHOLDER = '—';
const HASH_PLACEHOLDER = '·';

function getDisplayWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += /[\u0000-\u00ff]/.test(ch) ? 1 : 2;
    }
    return width;
}

function padDisplay(text: string, targetWidth: number): string {
    const pad = Math.max(0, targetWidth - getDisplayWidth(text));
    return `${text}${' '.repeat(pad)}`;
}

function truncateDisplay(text: string, maxWidth: number): string {
    if (getDisplayWidth(text) <= maxWidth) return text;
    let out = '';
    for (const ch of text) {
        const next = out + ch;
        if (getDisplayWidth(next) > maxWidth - 1) break;
        out = next;
    }
    return `${out}…`;
}

function extractResultFragment(page: string): string {
    const titleMarker = '<span class="glyphicon glyphicon-eye-open"></span> 四柱八字排盘结果';
    const start = page.indexOf(titleMarker);
    if (start < 0) return page;

    const backBtn = page.indexOf('返回重排', start);
    const warnPanel = page.indexOf('测算告诫', start);
    const endCandidates = [backBtn, warnPanel].filter((v) => v > start);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(page.length, start + 220000);
    return page.slice(start, end);
}

function parseParagraphs(html: string): string[] {
    const lines: string[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(html)) !== null) {
        const text = normalizeBasicValue(stripHtml(m[1])).trim();
        if (text) lines.push(text);
    }
    return lines;
}

function normalizeBodyText(input: string): string {
    const paragraphFriendly = input
        .replace(/<\s*\/p\s*>/gi, '\n')
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*\/li\s*>/gi, '\n');
    return stripHtml(paragraphFriendly)
        .replace(/\r/g, '')
        .replace(/\n\s*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parsePanelBodyByTitle(html: string, title: string): string {
    const marker = `<div class="panel-heading"><strong>${title}</strong></div>`;
    const start = html.indexOf(marker);
    if (start < 0) return '';

    const bodyStart = html.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return '';
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextHeading = html.indexOf('<div class="panel-heading"><strong>', contentStart);
    const nextPanel = html.indexOf('<div class="panel panel-default">', contentStart);
    const endCandidates = [nextHeading, nextPanel].filter((v) => v > contentStart);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : html.length;

    return html.slice(contentStart, end);
}

function parseTableRows(tableHtml: string): string[] {
    const rows: string[] = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trReg.exec(tableHtml)) !== null) {
        const cells: string[] = [];
        const tdReg = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        let td: RegExpExecArray | null;
        while ((td = tdReg.exec(tr[1])) !== null) {
            const raw = normalizeBasicValue(stripHtml(td[1]));
            const value = raw === '' ? EMPTY_PLACEHOLDER : raw === '#' ? HASH_PLACEHOLDER : raw;
            cells.push(value);
        }
        if (cells.length > 1) {
            const [head, ...rest] = cells;
            rows.push(`${head}：${rest.join(' ｜ ')}`);
        }
    }
    return rows;
}

function buildTableBlock(title: string, rows: string[]): string {
    if (rows.length === 0) return '';

    const matrix = rows.map((row) => {
        const [head, rest = ''] = row.split('：');
        const cols = rest ? rest.split(' ｜ ').map((s) => s.trim()) : [];
        return [head.trim(), ...cols];
    });

    const maxCols = Math.max(...matrix.map((r) => r.length));
    const normalized = matrix.map((r) => Array.from({length: maxCols}, (_, i) => r[i] ?? EMPTY_PLACEHOLDER));
    const maxCellWidth = 16;
    const colWidths = Array.from({length: maxCols}, () => 0);

    for (const row of normalized) {
        row.forEach((cell, idx) => {
            const clipped = truncateDisplay(cell, maxCellWidth);
            colWidths[idx] = Math.max(colWidths[idx], getDisplayWidth(clipped));
        });
    }

    const rowTexts = normalized.map((row) =>
        row
            .map((cell, idx) => {
                const clipped = truncateDisplay(cell, maxCellWidth);
                return padDisplay(clipped, colWidths[idx]);
            })
            .join(' ｜ '),
    );

    const rowWidth = Math.max(...rowTexts.map((row) => getDisplayWidth(row)));
    const top = `┌${'─'.repeat(rowWidth + 2)}`;
    const bottom = `└${'─'.repeat(rowWidth + 2)}`;
    return [`📋 ${title}`, top, ...rowTexts.map((line) => `│ ${padDisplay(line, rowWidth)}`), bottom].join('\n');
}

function parseFinancialSections(html: string): XuanxueSection[] {
    const out: XuanxueSection[] = [];
    const sectionReg = /<div class="panel-heading"><strong>([^<]+)<\/strong><\/div>\s*<div class="panel-body">([\s\S]*?)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = sectionReg.exec(html)) !== null) {
        const title = normalizeBasicValue(stripHtml(m[1]));
        if (!title || title === '八字排盘') continue;

        const content = normalizeBodyText(m[2]);
        if (!content) continue;

        out.push({title, content});
    }
    return out;
}

export function parseCaiyunHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const baziBodyHtml = parsePanelBodyByTitle(fragment, '八字排盘');
    const summary = parseParagraphs(baziBodyHtml).slice(0, 12);

    const sections: XuanxueSection[] = [];

    const tableMatch = baziBodyHtml.match(/<table[^>]*>[\s\S]*?<\/table>/i);
    if (tableMatch?.[0]) {
        const rows = parseTableRows(tableMatch[0]);
        if (rows.length > 0) {
            sections.push({
                title: '八字排盘',
                content: buildTableBlock('四柱命盘', rows),
            });
        }
    }

    sections.push(...parseFinancialSections(fragment));
    return {summary, sections};
}

