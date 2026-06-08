/** 占卜类（每日一占 / 摇卦占卜 / 指纹占卜 / 塔罗牌等）通用 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

// 各占卜结果页共同的结果面板标志（glyphicon-eye-open 后接结果二字即可）
const RESULT_MARKER_RE = /<span class="glyphicon glyphicon-eye-open"><\/span>\s*[^<]*结果/;

function normalizeImageUrl(src: string): string {
    const value = src.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `https://store.yuanfenju.com${value}`;
    return `https://store.yuanfenju.com/${value.replace(/^\/+/, '')}`;
}

function extractResultFragment(page: string): string {
    const match = RESULT_MARKER_RE.exec(page);
    const start = match ? match.index : -1;
    if (start < 0) return page;

    // 截止于"返回重测"或"测算告诫"，取最近的那个
    const end1 = page.indexOf('返回重测', start);
    const end2 = page.indexOf('测算告诫', start);
    const candidates = [end1, end2].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 60000);
    return page.slice(start, end);
}

function stripHtmlWithParagraphs(input: string): string {
    const paragraphFriendly = input
        .replace(/<\s*\/p\s*>/gi, '\n')
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*\/li\s*>/gi, '\n');
    return stripHtml(paragraphFriendly);
}

function parseSectionBlocks(html: string): XuanxueSection[] {
    const sections: XuanxueSection[] = [];
    const sectionReg =
        /<div class="panel-heading">\s*<strong>([^<]+)<\/strong>\s*<\/div>\s*<div class="panel-body">([\s\S]*?)<\/div>/gi;

    let m: RegExpExecArray | null;
    while ((m = sectionReg.exec(html)) !== null) {
        const title = normalizeBasicValue(stripHtml(m[1])).trim();
        const content = stripHtmlWithParagraphs(m[2]).replace(/\s*\n\s*/g, '\n').trim();
        if (!title || !content) continue;
        sections.push({title, content});
    }

    return sections;
}

function parseBasicSummary(html: string): string[] {
    const basicMarker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = html.indexOf(basicMarker);
    if (start < 0) return [];

    const bodyStart = html.indexOf('<div class="panel-body">', start + basicMarker.length);
    if (bodyStart < 0) return [];

    const contentStart = bodyStart + '<div class="panel-body">'.length;
    const nextHeading = html.indexOf('<div class="panel-heading"><strong>', contentStart);
    const end = nextHeading > contentStart ? nextHeading : html.length;
    const fragment = html.slice(contentStart, end);

    const lines: string[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(fragment)) !== null) {
        const text = normalizeBasicValue(stripHtml(m[1])).trim();
        if (text) lines.push(text);
    }
    return lines;
}

function parsePreviewImageUrl(html: string): string | undefined {
    const match = html.match(/<img[^>]*class="[^"]*pull-right[^"]*"[^>]*src="([^"]+)"/i)
        || html.match(/<img[^>]*src="([^"]+)"/i);
    const src = match?.[1] ? normalizeImageUrl(match[1]) : '';
    return src || undefined;
}

export function parseZhanbuHtml(page: string): BaziParsedResult {
    const resultRoot = extractResultFragment(page);
    const summary = parseBasicSummary(resultRoot).slice(0, 8);
    const previewImageUrl = parsePreviewImageUrl(resultRoot);

    const rawSections = parseSectionBlocks(resultRoot);
    const sections = rawSections.filter((s) => s.title !== '基本信息');

    return {summary, sections, previewImageUrl};
}

