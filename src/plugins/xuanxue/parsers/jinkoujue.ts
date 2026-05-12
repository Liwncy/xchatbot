/** 金口诀排盘 HTML 解析器 */

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
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 100000);
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

function parseJinkoujueSection(fragment: string): XuanxueSection | null {
    const marker = '<div class="panel-heading"><strong>金口诀排盘</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return null;

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return null;
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextPanel = fragment.indexOf('<div class="panel panel-default">', contentStart);
    const end = nextPanel > contentStart ? nextPanel : fragment.length;
    const block = fragment.slice(contentStart, end);

    const lines = stripHtmlWithBreaks(block)
        .split('\n')
        .map((line) => normalizeBasicValue(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((line) => `• ${line}`);

    if (lines.length === 0) return null;
    return {
        title: '金口诀排盘',
        content: lines.join('\n'),
    };
}

export function parseJinkoujueHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const sections: XuanxueSection[] = [];

    const pan = parseJinkoujueSection(fragment);
    if (pan) sections.push(pan);

    return {summary, sections};
}

