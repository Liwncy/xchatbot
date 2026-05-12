/** 八字未来运势 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function extractResultFragment(page: string): string {
    // 从"基本信息"面板开始
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = page.indexOf(marker);
    if (start < 0) return page;

    // 截止于"返回重测"或"测算告诫"，取最近的那个
    const end1 = page.indexOf('返回重测', start);
    const end2 = page.indexOf('测算告诫', start);
    const candidates = [end1, end2].filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 200000);
    return page.slice(start, end);
}

function stripHtmlWithLineBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n'),
    );
}

function parseBasicSummary(fragment: string): string[] {
    const marker = '<div class="panel-heading"><strong>基本信息</strong></div>';
    const start = fragment.indexOf(marker);
    if (start < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextHeading = fragment.indexOf('<div class="panel-heading"><strong>', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    const lines: string[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(block)) !== null) {
        const text = normalizeBasicValue(stripHtmlWithLineBreaks(m[1])).replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
    }
    return lines.slice(0, 14);
}

function parseSimpleSection(fragment: string, title: string): XuanxueSection | null {
    const marker = `<div class="panel-heading"><strong>${title}</strong></div>`;
    const start = fragment.indexOf(marker);
    if (start < 0) return null;

    const bodyStart = fragment.indexOf('<div class="panel-body">', start + marker.length);
    if (bodyStart < 0) return null;
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    // 截止到下一个 panel-heading
    const nextHeading = fragment.indexOf('<div class="panel-heading"><strong>', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    const text = normalizeBasicValue(stripHtmlWithLineBreaks(block)).replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return null;
    return {title, content: text};
}

/** 解析 "2027年运势" 这类标题的运势分析面板，剔除每月明细 */
function parseYearFortuneSection(fragment: string): XuanxueSection | null {
    // 匹配形如 "2027年运势" 的标题
    const headingReg = /<div class="panel-heading"><strong>(\d{4}年运势)<\/strong><\/div>/;
    const headingMatch = headingReg.exec(fragment);
    if (!headingMatch) return null;

    const sectionTitle = headingMatch[1];
    const headingEnd = headingMatch.index + headingMatch[0].length;

    const bodyStart = fragment.indexOf('<div class="panel-body">', headingEnd);
    if (bodyStart < 0) return null;
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    // 截止到下一个 panel-heading 或返回重测
    const nextHeading = fragment.indexOf('<div class="panel-heading"><strong>', contentStart);
    const end = nextHeading > contentStart ? nextHeading : fragment.length;
    const block = fragment.slice(contentStart, end);

    // 每月运势通常以"[X月]"或"【X月】"格式开头
    // 找到第一个月份标记之前的内容作为年度总论
    const monthMarkerReg = /[【\[](?:\d{1,2}|一|二|三|四|五|六|七|八|九|十|十一|十二)月[】\]]/;
    const monthMatch = monthMarkerReg.exec(block);
    const yearBlock = monthMatch ? block.slice(0, monthMatch.index) : block;

    const lines: string[] = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(yearBlock)) !== null) {
        const text = normalizeBasicValue(stripHtmlWithLineBreaks(m[1])).replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
    }

    // 若没有 <p> 标签，直接取纯文本
    if (lines.length === 0) {
        const rawText = normalizeBasicValue(stripHtmlWithLineBreaks(yearBlock)).replace(/\s+/g, ' ').trim();
        if (rawText) lines.push(rawText);
    }

    if (lines.length === 0) return null;
    return {title: sectionTitle, content: lines.join('\n')};
}

export function parseWeilaiHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);

    const sections: XuanxueSection[] = [];

    const xiyong = parseSimpleSection(fragment, '喜用神分析');
    if (xiyong) sections.push(xiyong);

    const yearFortune = parseYearFortuneSection(fragment);
    if (yearFortune) sections.push(yearFortune);

    return {summary, sections};
}

