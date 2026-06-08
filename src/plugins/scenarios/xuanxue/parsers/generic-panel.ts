/**
 * 通用 panel-heading/panel-body 结构解析器。
 * 适用于基本信息 + 若干内容分栏结构（九星算命、生日论命、骨相论命、称骨论命等）。
 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    // 去掉 base64 内联图片，避免输出爆长
    const stripped = page.replace(/src="data:[^"]{100,}"/gi, 'src=""');

    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = stripped.indexOf(marker);
    if (start < 0) return stripped;

    const candidates = ['返回重测', '返回重排', '测算告诫', '最新文章']
        .map((s) => stripped.indexOf(s, start))
        .filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(stripped.length, start + 200000);
    return stripped.slice(start, end);
}

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function parseBasicSummary(fragment: string, summaryLabels: string[]): string[] {
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextHeading = fragment.indexOf('<div class="panel-heading">', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    const lines = stripHtmlWithBreaks(block)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const isKnownLabelLine = (line: string) => summaryLabels.some((label) => line.startsWith(label));

    const results: string[] = [];
    for (const label of summaryLabels) {
        const idx = lines.findIndex((line) => line.startsWith(label));
        if (idx < 0) continue;

        const hit = lines[idx];
        const tail = hit.slice(label.length).trim();
        if (tail) {
            results.push(hit);
            continue;
        }

        // 某些页面会把值换行到下一行（如：姓名笔画/姓名五行）
        let value = '';
        for (let i = idx + 1; i < lines.length; i++) {
            const candidate = lines[i].trim();
            if (!candidate) continue;
            if (isKnownLabelLine(candidate)) break;
            value = candidate;
            break;
        }

        results.push(value ? `${label} ${value}` : hit);
    }

    return results;
}

function parseSections(fragment: string): XuanxueSection[] {
    const sectionReg =
        /<div class="panel-heading">\s*<strong>([^<]+)<\/strong>\s*<\/div>\s*<div class="panel-body">([\s\S]*?)<\/div>/gi;

    const sections: XuanxueSection[] = [];
    let match: RegExpExecArray | null;
    while ((match = sectionReg.exec(fragment)) !== null) {
        const title = stripHtml(match[1]).replace(/\s+/g, ' ').trim();
        if (!title || title === '基本信息') continue;

        const content = stripHtmlWithBreaks(match[2])
            .split('\n')
            .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
        if (!content) continue;

        sections.push({title, content});
    }

    return sections.slice(0, 12);
}

export function parseGenericPanelHtml(page: string, summaryLabels: string[]): BaziParsedResult {
    const fragment = extractResultFragment(page);
    return {
        summary: parseBasicSummary(fragment, summaryLabels),
        sections: parseSections(fragment),
    };
}

