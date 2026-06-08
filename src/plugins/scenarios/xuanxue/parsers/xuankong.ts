/** 玄空飞星（风水堪舆）HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n')
            .replace(/<\s*hr\s*\/?\s*>/gi, '\n---\n'),
    );
}

function extractResultFragment(page: string): string {
    const startMatch = /基\s*本\s*信\s*息/.exec(page);
    const start = startMatch?.index ?? -1;
    if (start < 0) return page;

    const endCandidates = ['返回重排', '最新文章']
        .map((marker) => page.indexOf(marker, start))
        .filter((v) => v > start);
    const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(page.length, start + 300000);
    return page.slice(start, end);
}

function extractBasicInfo(fragment: string): {summary: string[]; sections: XuanxueSection[]} {
    const summary: string[] = [];
    const sections: XuanxueSection[] = [];

    const feixingIndex = fragment.indexOf('飞星盘');
    const basicBody = feixingIndex > 0 ? fragment.slice(0, feixingIndex) : fragment.slice(0, Math.min(fragment.length, 12000));

    const kvReg = /<strong>\s*([^：:<]+)[：:]\s*<\/strong>\s*([\s\S]*?)\s*<br\s*\/?\s*>/gi;

    const detailLines: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = kvReg.exec(basicBody)) !== null) {
        const key = normalizeBasicValue(stripHtml(m[1])).trim();
        const value = normalizeBasicValue(stripHtmlWithBreaks(m[2])).trim();
        if (!key || !value) continue;

        const line = `${key}：${value}`;
        detailLines.push(line);

        if (key === '元运' || key === '山向') {
            summary.push(line);
        }
    }

    if (detailLines.length > 0) {
        sections.push({
            title: '基本信息',
            content: detailLines.join('\n'),
        });
    }

    return {summary, sections};
}

function parseTableBlock(tableHtml: string): string {
    const rows: string[] = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trReg.exec(tableHtml)) !== null) {
        const cells: string[] = [];
        const tdReg = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let td: RegExpExecArray | null;
        while ((td = tdReg.exec(tr[1])) !== null) {
            const raw = stripHtmlWithBreaks(td[1])
                .split('\n')
                .map((s) => normalizeBasicValue(s).trim())
                .filter(Boolean)
                .join(' / ');
            if (raw) cells.push(raw);
        }
        if (cells.length > 0) rows.push(cells.join(' ｜ '));
    }
    return rows.join('\n');
}

function extractPanelSection(fragment: string, headingPrefix: string, title: string): XuanxueSection | null {
    const escaped = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const panelReg = new RegExp(`<div class="panel-heading"><strong>(${escaped}[^<]*)<\\/strong><\\/div>[\\s\\S]*?<table>([\\s\\S]*?)<\\/table>`, 'i');
    const match = panelReg.exec(fragment);
    if (!match) return null;

    const heading = normalizeBasicValue(stripHtml(match[1])).trim();
    const tableText = parseTableBlock(match[2]).trim();
    if (!tableText) return null;

    const content = heading && heading !== headingPrefix ? `${heading}\n${tableText}` : tableText;
    return {title, content};
}

function extractFeixingComment(fragment: string): XuanxueSection | null {
    const match = /<div class="panel-heading"><strong>飞星批示<\/strong><\/div>[\s\S]*?<div class="panel-body">([\s\S]*?)<\/div>\s*<\/div>/i.exec(fragment);
    if (!match) return null;

    // 不用 normalizeBasicValue，保留换行结构，仅去掉多余空行
    const bodyRaw = stripHtmlWithBreaks(match[1])
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!bodyRaw) return null;

    const chunks = bodyRaw
        .split(/\n?\s*---\s*\n?/)
        .map((s) => s.trim())
        .filter(Boolean);

    const lines: string[] = [];
    for (const chunk of chunks) {
        const starMatch = chunk.match(/\[地盘\][：:]\s*([^\n]+)\s*[\s\S]*?\[解析\][：:]\s*([\s\S]*)/);
        if (!starMatch) continue;
        const star = starMatch[1].replace(/\s+/g, ' ').trim();
        const detail = starMatch[2].replace(/[ \t]+/g, ' ').trim();
        if (!star || !detail) continue;

        lines.push(`【${star}】${detail}`);
    }

    if (lines.length === 0) {
        return {title: '飞星批示', content: bodyRaw};
    }

    return {
        title: '飞星批示',
        content: lines.join('\n'),
    };
}

export function parseXuankongHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);

    const {summary, sections} = extractBasicInfo(fragment);

    const feixingPan = extractPanelSection(fragment, '飞星盘', '飞星盘');
    if (feixingPan) sections.push(feixingPan);

    const longjuePan = extractPanelSection(fragment, '排龙诀', '排龙诀');
    if (longjuePan) sections.push(longjuePan);

    const mingpan = extractPanelSection(fragment, '排命盘', '排命盘');
    if (mingpan) sections.push(mingpan);

    const comments = extractFeixingComment(fragment);
    if (comments) sections.push(comments);

    return {
        summary,
        sections,
    };
}




