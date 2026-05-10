/** 四柱八字排盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

const EMPTY_PLACEHOLDER = '—';
const HASH_PLACEHOLDER = '·';

function findFragment(page: string, title: string, window = 30000): string {
    const marker = `<div class="panel-heading"><strong>${title}</strong></div>`;
    const start = page.indexOf(marker);
    if (start < 0) return '';

    // 优先在下一个同结构 panel-heading 处截断，避免把后续友链/页脚抓进来。
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

function parseTableRows(html: string): string[] {
    const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
    if (!tableMatch) return [];

    const table = tableMatch[0];
    const out: string[] = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trReg.exec(table)) !== null) {
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
            out.push(`${head}：${rest.join(' ｜ ')}`);
        }
    }
    return out;
}

function buildTableBlock(title: string, rows: string[]): string {
    if (rows.length === 0) return '';

    const matrix = rows.map((row) => {
        const [head, rest = ''] = row.split('：');
        const cols = rest ? rest.split(' ｜ ').map((s) => s.trim()) : [];
        return [head.trim(), ...cols];
    });

    const maxCols = Math.max(...matrix.map((r) => r.length));
    const normalized = matrix.map((r) => Array.from({length: maxCols}, (_, i) => r[i] ?? '—'));
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

export function parsePaipanHtml(page: string): BaziParsedResult {
    const mainFrag = findFragment(page, '八字排盘', 30000);
    const shenshaFrag = findFragment(page, '四柱神煞', 15000);
    const dayunFrag = findFragment(page, '大运排盘', 120000);
    const dayunShenshaFrag = findFragment(page, '大运神煞', 30000);

    const summary = parseParagraphs(mainFrag).slice(0, 8);

    const sections: XuanxueSection[] = [];

    const baziRows = parseTableRows(mainFrag);
    if (baziRows.length > 0) {
        sections.push({
            title: '八字排盘',
            content: buildTableBlock('四柱命盘', baziRows),
        });
    }

    const shenshaLines = parseParagraphs(shenshaFrag);
    if (shenshaLines.length > 0) {
        sections.push({
            title: '四柱神煞',
            content: shenshaLines.map((l) => `• ${l}`).join('\n'),
        });
    }

    const dayunRows = parseTableRows(dayunFrag);
    if (dayunRows.length > 0) {
        sections.push({
            title: '大运排盘',
            content: buildTableBlock('大运流转', dayunRows.slice(0, 40)),
        });
    }

    const dayunShenshaLines = parseParagraphs(dayunShenshaFrag);
    if (dayunShenshaLines.length > 0) {
        sections.push({
            title: '大运神煞',
            content: dayunShenshaLines.map((l) => `• ${l}`).join('\n'),
        });
    }

    return {summary, sections};
}

