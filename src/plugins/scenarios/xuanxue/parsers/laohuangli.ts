/** 老黄历查询 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {BaziParsedResult, XuanxueSection} from './bazi.js';

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\s*\/p\s*>/gi, '\n')
            .replace(/<\s*\/li\s*>/gi, '\n'),
    );
}

function extractResultFragment(page: string): string {
    const start = page.indexOf('黄历详情');
    if (start < 0) return page;

    const endMarkers = ['时辰吉凶', '最新文章', '返回重测'];
    const candidates = endMarkers.map((marker) => page.indexOf(marker, start)).filter((v) => v > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 250000);
    return page.slice(start, end);
}

function parseSummary(fragment: string): string[] {
    const blockMatch = /<p[^>]*font-size\s*:\s*1\.2em[^>]*>([\s\S]*?)<\/p>/i.exec(fragment);
    if (!blockMatch) return [];

    return stripHtmlWithBreaks(blockMatch[1])
        .split('\n')
        .map((line) => normalizeBasicValue(line))
        .map((line) => line.trim())
        .filter(Boolean);
}

function parseYiJi(fragment: string): XuanxueSection | null {
    const yiMatch = /circle-green[\s\S]*?>\s*宜\s*<\/span>([\s\S]*?)<\/p>/i.exec(fragment);
    const jiMatch = /circle-red[\s\S]*?>\s*忌\s*<\/span>([\s\S]*?)<\/p>/i.exec(fragment);

    const yi = normalizeBasicValue(stripHtml(yiMatch?.[1] ?? '')).trim() || '无';
    const ji = normalizeBasicValue(stripHtml(jiMatch?.[1] ?? '')).trim() || '无';

    if (!yiMatch && !jiMatch) return null;
    return {
        title: '今日宜忌',
        content: `✅ 宜：${yi}\n⛔ 忌：${ji}`,
    };
}

function parseKeyValueBlocks(fragment: string): XuanxueSection[] {
    const sections: XuanxueSection[] = [];

    const paragraphReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = paragraphReg.exec(fragment)) !== null) {
        const body = match[1];
        if (!/#cd9c6b/i.test(body)) continue;

        const titleMatch = /<font[^>]*#cd9c6b[^>]*>\s*([^<]+?)\s*<\/font>/i.exec(body);
        if (!titleMatch) continue;
        const title = normalizeBasicValue(stripHtml(titleMatch[1])).trim();
        if (!title) continue;

        const brValueMatch = /<br\s*\/?\s*>\s*<span[^>]*>([\s\S]*?)<\/span>/i.exec(body);
        const inlineValueRaw = body.replace(/^[\s\S]*?<\/font>/i, '');
        const value = normalizeBasicValue(stripHtml(brValueMatch?.[1] ?? inlineValueRaw)).trim();
        if (!value) continue;

        sections.push({title, content: value});
    }

    return sections;
}

function buildGroupedDetailContent(items: XuanxueSection[]): string {
    const map = new Map<string, string>();
    for (const item of items) {
        if (!map.has(item.title)) {
            map.set(item.title, item.content);
        }
    }

    const pickLines = (titleOrder: string[], icon = '•'): string[] =>
        titleOrder
            .map((title) => {
                const value = map.get(title);
                if (!value) return '';
                return `${icon} ${title}：${value}`;
            })
            .filter(Boolean);

    const lines: string[] = [];

    const directionLines = pickLines(['财神方位', '喜神方位', '福神方位', '贵神方位', '今日胎神', '本月胎神'], '🧭');
    if (directionLines.length > 0) {
        lines.push('【方位速览】');
        lines.push(...directionLines);
    }

    const baseLines = pickLines(['值神', '冲煞', '五行', '建除十二神', '二十八星宿'], '•');
    if (baseLines.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('【今日总览】');
        lines.push(...baseLines);
    }

    const spiritLines = pickLines(['吉神宜趋', '凶神宜忌', '彭祖百忌'], '◇');
    if (spiritLines.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('【神煞参考】');
        lines.push(...spiritLines);
    }

    const trendLines = pickLines(['六曜', '七政', '物候', '月相'], '☼');
    if (trendLines.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('【节律趋势】');
        lines.push(...trendLines);
    }

    const verse = map.get('歌诀');
    if (verse) {
        if (lines.length > 0) lines.push('');
        lines.push('【歌诀】');
        lines.push(verse);
    }

    if (lines.length === 0) {
        return items.map((item) => `【${item.title}】${item.content}`).join('\n');
    }

    return lines.join('\n');
}

export function parseLaohuangliHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseSummary(fragment);

    const sections: XuanxueSection[] = [];
    const yiJi = parseYiJi(fragment);
    if (yiJi) sections.push(yiJi);

    const detailBlocks = parseKeyValueBlocks(fragment);
    if (detailBlocks.length > 0) {
        sections.push({
            title: '黄历信息',
            content: buildGroupedDetailContent(detailBlocks),
        });
    }

    return {
        summary,
        sections,
    };
}

