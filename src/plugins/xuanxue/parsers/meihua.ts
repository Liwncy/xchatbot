/** 梅花易数排盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    const end1 = page.indexOf('返回重排', start);
    const end2 = page.indexOf('测算告诫', start);
    const end3 = page.indexOf('最新文章', start);
    const candidates = [end1, end2, end3].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 220000);
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

function cleanMeihuaNoiseLines(input: string): string {
    const noiseLine = /^(?:X|O|gua-line|[-—]{1,3})$/i;
    return input
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !noiseLine.test(line))
        .join('\n');
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

    return stripHtmlWithBreaks(block)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 20);
}

function parseMeihuaSections(fragment: string): XuanxueSection[] {
    const marker = '<div class="panel-heading"><strong>梅花易数排盘</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextPanel = fragment.indexOf('<div class="panel panel-default">', contentStart);
    const end = nextPanel > contentStart ? nextPanel : fragment.length;
    const block = fragment.slice(contentStart, end);

    let text = stripHtmlWithBreaks(block)
        .replace(/\s*【/g, '\n【')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!text) return [];

    // 清理偶发的重复分隔段落
    text = text.replace(/(\n\s*\n){3,}/g, '\n\n');
    // 清理卦线图片区残留的独立噪音字符（如 X/O）
    text = cleanMeihuaNoiseLines(text).replace(/\n{3,}/g, '\n\n').trim();

    const sections: XuanxueSection[] = [];
    const majorReg = /【(主卦|互卦|变卦|错卦|综卦)】[^\n]*/g;
    const matches = Array.from(text.matchAll(majorReg));

    if (matches.length === 0) {
        return [{title: '梅花易数排盘', content: text}];
    }

    for (let i = 0; i < matches.length; i += 1) {
        const current = matches[i];
        const next = matches[i + 1];
        const startIdx = current.index ?? 0;
        const endIdx = next?.index ?? text.length;
        const chunk = text.slice(startIdx, endIdx).trim();
        if (!chunk) continue;

        const label = current[1];
        sections.push({
            title: `梅花易数·${label}`,
            content: chunk,
        });
    }

    return sections;
}

export function parseMeihuaHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const sections = parseMeihuaSections(fragment);

    return {summary, sections};
}

