/** 紫微排盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

const ZWPAN_PRIORITY_TITLES = ['命宫', '官禄宫', '财帛宫', '夫妻宫', '疾厄宫', '迁移宫'];

function extractResultFragment(page: string): string {
    const markers = [
        '<div class="panel-heading"><strong>紫微排盘</strong></div>',
        '<div class="panel-heading"><strong>紫微流盘</strong></div>',
        '<h3 class="panel-title"><span class="glyphicon glyphicon-eye-open"></span> 紫微排盘结果</h3>',
        '<h3 class="panel-title"><span class="glyphicon glyphicon-eye-open"></span> 紫微流排盘结果</h3>',
    ];
    const starts = markers.map((marker) => page.indexOf(marker)).filter((idx) => idx >= 0);
    const start = starts.length > 0 ? Math.min(...starts) : -1;
    if (start < 0) return page;

    const end1 = page.indexOf('返回重排', start);
    const end2 = page.indexOf('测算告诫', start);
    const candidates = [end1, end2].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 200000);
    return page.slice(start, end);
}

function stripHtmlClean(input: string): string {
    return stripHtml(input.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
        .replace(/\s{2,}/g, ' ').trim();
}

/** 提取命盘中心格里的基本信息（colspan/rowspan 合并单元格） */
function parseCenterInfo(fragment: string): string[] {
    // 中心格特征：colspan="2" rowspan="2"
    const centerReg = /<td[^>]*colspan="2"[^>]*rowspan="2"[^>]*>([\s\S]*?)<\/td>/i;
    const match = centerReg.exec(fragment);
    if (!match) return [];

    const lines = stripHtml(match[1].replace(/<br\s*\/?>/gi, '\n'))
        .split('\n')
        .map((l) => normalizeBasicValue(l).trim())
        .filter(Boolean);
    return lines;
}

/** 解析命盘 4×4 表格中的每个宫格 */
function parseChartCells(fragment: string): string[] {
    const tableStart = fragment.indexOf('<table');
    if (tableStart < 0) return [];
    const tableEnd = fragment.indexOf('</table>', tableStart);
    if (tableEnd < 0) return [];
    const tableBlock = fragment.slice(tableStart, tableEnd + 8);

    const cells: string[] = [];
    const tdReg = /<td(?![^>]*colspan)[^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;

    while ((m = tdReg.exec(tableBlock)) !== null) {
        const raw = m[1];
        // 跳过center格（有colspan）
        if (/colspan/i.test(m[0])) continue;

        const lines = stripHtml(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
            .split('\n')
            .map((l) => normalizeBasicValue(l).replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        // 最后一行通常含"XX宫"和干支，前几行含主星
        const palace = lines.find((l) => l.includes('宫')) ?? '';
        const stars = lines.filter((l) =>
            !l.match(/^\d{1,3}-\d{1,3}$/) &&
            !l.match(/^[\d]+$/) &&
            l !== palace &&
            l.length <= 30,
        ).slice(0, 3).join(' ');

        if (palace) {
            cells.push(`${palace}：${stars || '—'}`);
        }
    }

    return cells;
}

/** 解析各宫简批段落 */
function parseJianpiSections(fragment: string): XuanxueSection[] {
    const marker = '<div class="panel-heading"><strong>排盘简批</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextPanel = fragment.indexOf('<div style="text-align:center;">', contentStart);
    const end = nextPanel > contentStart ? nextPanel : fragment.length;
    const block = fragment.slice(contentStart, end);

    const sections: XuanxueSection[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;

    while ((m = pReg.exec(block)) !== null) {
        const raw = m[1];
        // 段落以 <strong>宫名：</strong> 开头
        const titleMatch = /<strong>([^<]+)：<\/strong>/.exec(raw);
        if (!titleMatch) continue;

        const title = titleMatch[1].trim();
        // 提取三个子段落（紫微星系/天府星系/辅星详解）
        const parts: string[] = [];
        const frag = raw.replace(/<br>/gi, '\n');
        const segReg = /\[([^\]]+)\]：([\s\S]*?)(?=\[|$)/g;
        let seg: RegExpExecArray | null;
        while ((seg = segReg.exec(stripHtml(frag))) !== null) {
            const label = seg[1].trim();
            const content = normalizeBasicValue(seg[2]).replace(/\s+/g, ' ').trim();
            if (content && !content.includes('暂时没有具体的详解')) {
                parts.push(`【${label}】${content}`);
            }
        }

        if (parts.length === 0) {
            const fallback = stripHtmlClean(raw.replace(/<strong>[^<]+：<\/strong>/, ''));
            if (fallback) parts.push(fallback);
        }

        if (parts.length > 0) {
            sections.push({title, content: parts.join('\n')});
        }
    }

    return sections;
}

export function parseZwpanHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);

    // 命盘中心信息作为 summary
    const centerInfo = parseCenterInfo(fragment);
    // 各宫主星作为 summary 补充
    const chartCells = parseChartCells(fragment);

    const summary = [
        ...centerInfo,
        ...(chartCells.length > 0 ? ['', '📋 命盘各宫主星：', ...chartCells] : []),
    ];

    // 各宫简批作为独立 section
    const rawSections = parseJianpiSections(fragment);

    // 优先展示关键宫位，其他宫位按顺序补充，避免内容过大导致发不出。
    const prioritized: XuanxueSection[] = [];
    for (const title of ZWPAN_PRIORITY_TITLES) {
        const found = rawSections.find((s) => s.title === title);
        if (found) prioritized.push(found);
    }
    const rest = rawSections.filter((s) => !ZWPAN_PRIORITY_TITLES.includes(s.title));
    const sections = [...prioritized, ...rest];

    return {summary, sections};
}

