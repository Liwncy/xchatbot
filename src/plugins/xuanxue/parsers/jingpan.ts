/** 四柱八字流盘（精盘）HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

const EMPTY_PLACEHOLDER = '—';
const HASH_PLACEHOLDER = '·';

function findFragment(page: string, title: string, window = 120000): string {
    const marker = `<div class="panel-heading"><strong>${title}</strong></div>`;
    const start = page.indexOf(marker);
    if (start < 0) return '';

    const nextHeading = page.indexOf('<div class="panel-heading"><strong>', start + marker.length);
    const backBtn = page.indexOf('返回重排', start + marker.length);
    const candidates = [nextHeading, backBtn, start + window].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + window);
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

function parseAllTables(html: string): string[][] {
    const tables: string[][] = [];
    const tableReg = /<table[^>]*>[\s\S]*?<\/table>/gi;
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableReg.exec(html)) !== null) {
        const rows: string[] = [];
        const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr: RegExpExecArray | null;
        while ((tr = trReg.exec(tableMatch[0])) !== null) {
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
        if (rows.length > 0) tables.push(rows);
    }
    return tables;
}

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

function buildTableBlock(title: string, rows: string[], maxRows = 40): string {
    if (rows.length === 0) return '';

    const matrix = rows.slice(0, maxRows).map((row) => {
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
            .map((cell, i) => {
                const clipped = truncateDisplay(cell, maxCellWidth);
                return padDisplay(clipped, colWidths[i]);
            })
            .join(' ｜ '),
    );
    const rowWidth = Math.max(...rowTexts.map((r) => getDisplayWidth(r)));
    const top = `┌${'─'.repeat(rowWidth + 2)}`;
    const bottom = `└${'─'.repeat(rowWidth + 2)}`;

    return [`📋 ${title}`, top, ...rowTexts.map((line) => `│ ${padDisplay(line, rowWidth)}`), bottom].join('\n');
}

export function parseJingpanHtml(page: string): BaziParsedResult {
    const mainFrag = findFragment(page, '流年盘', 160000);
    const taimingFrag = findFragment(page, '胎命身', 50000);

    const summary = parseParagraphs(mainFrag).slice(0, 16);
    const sections: XuanxueSection[] = [];

    const mainTables = parseAllTables(mainFrag);
    if (mainTables[0]?.length) {
        sections.push({
            title: '流年盘',
            content: buildTableBlock('流年流月速览', mainTables[0], 32),
        });
    }
    if (mainTables[1]?.length) {
        sections.push({
            title: '流年细盘',
            content: buildTableBlock('流年柱位细盘', mainTables[1], 28),
        });
    }

    const taimingTables = parseAllTables(taimingFrag);
    if (taimingTables[0]?.length) {
        sections.push({
            title: '胎命身',
            content: buildTableBlock('胎元命宫身宫', taimingTables[0], 20),
        });
    }

    return {summary, sections};
}

