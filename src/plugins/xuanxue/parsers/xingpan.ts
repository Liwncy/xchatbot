/** 星座星盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    const marker = '<h3 class="panel-title"><span class="glyphicon glyphicon-list"></span> 基本信息</h3>';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    const end0 = page.indexOf('返回重排', start);
    const end1 = page.indexOf('测算告诫', start);
    const end2 = page.indexOf('最新文章', start);
    const candidates = [end0, end1, end2].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 260000);
    return page.slice(start, end);
}

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function normalizeImageUrl(src: string): string {
    const value = src.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `https://store.yuanfenju.com${value}`;
    return `https://store.yuanfenju.com/${value.replace(/^\/+/, '')}`;
}

function parsePreviewImageUrl(fragment: string): string | undefined {
    const match = fragment.match(/<img[^>]*class="[^"]*responsive-img[^"]*"[^>]*src="([^"]+)"/i)
        || fragment.match(/<img[^>]*src="([^"]+)"/i);
    const src = match?.[1] ? normalizeImageUrl(match[1]) : '';
    return src || undefined;
}

function parseBasicSummary(fragment: string): string[] {
    const marker = '<h3 class="panel-title"><span class="glyphicon glyphicon-list"></span> 基本信息</h3>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextHeading = fragment.indexOf('<div class="panel-heading">', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    return stripHtmlWithBreaks(block)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 16);
}

function getPanelBodyByTitle(fragment: string, title: string): string {
    const marker = `<h3 class="panel-title"><span class="glyphicon glyphicon-list"></span> ${title}</h3>`;
    const start = fragment.indexOf(marker);
    if (start < 0) return '';

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return '';
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextHeading = fragment.indexOf('<div class="panel-heading">', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    return fragment.slice(contentStart, end);
}

function parseTableSection(fragment: string, title: string): XuanxueSection | null {
    const body = getPanelBodyByTitle(fragment, title);
    if (!body) return null;

    const tableMatch = body.match(/<table[^>]*>[\s\S]*?<\/table>/i);
    if (!tableMatch) return null;

    const lines: string[] = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trReg.exec(tableMatch[0])) !== null) {
        const cells: string[] = [];
        const tdReg = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        let td: RegExpExecArray | null;
        while ((td = tdReg.exec(tr[1])) !== null) {
            const cell = normalizeBasicValue(stripHtmlWithBreaks(td[1])).replace(/\s+/g, ' ').trim();
            if (cell) cells.push(cell);
        }
        if (cells.length > 0) lines.push(cells.join(' ｜ '));
    }

    if (lines.length === 0) return null;
    return {title, content: lines.join('\n')};
}

function parseTextSection(fragment: string, title: string): XuanxueSection | null {
    const body = getPanelBodyByTitle(fragment, title);
    if (!body) return null;

    const text = stripHtmlWithBreaks(body)
        .replace(/\s*【/g, '\n【')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!text) return null;
    return {title, content: text};
}

export function parseXingpanHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const previewImageUrl = parsePreviewImageUrl(fragment);

    const sections: XuanxueSection[] = [];

    const tableTitles = ['星体落入星座', '各宫位置', '相位列表', '四轴'];
    for (const title of tableTitles) {
        const parsed = parseTableSection(fragment, title);
        if (parsed) sections.push(parsed);
    }

    const textTitles = ['星座解析', '落宫解析', '相位解析', '四轴解析'];
    for (const title of textTitles) {
        const parsed = parseTextSection(fragment, title);
        if (parsed) sections.push(parsed);
    }

    return {summary, sections, previewImageUrl};
}

