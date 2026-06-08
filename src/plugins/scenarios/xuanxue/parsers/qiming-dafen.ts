/** 起名打分结果 HTML 解析器（多候选姓名列表） */

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

function parseKeyValues(block: string): Record<string, string> {
    const out: Record<string, string> = {};
    const pReg = /<p[^>]*>\s*<strong>\s*([^：<]+[：:])\s*<\/strong>\s*([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(block)) !== null) {
        const key = normalizeBasicValue(stripHtml(m[1])).trim();
        const value = stripHtmlWithBreaks(m[2])
            .split('\n')
            .map((s) => normalizeBasicValue(s).trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        if (!key || !value) continue;
        out[key] = value;
    }
    return out;
}

export function parseQimingDafenHtml(page: string): BaziParsedResult {
    const summary: string[] = [];
    const sections: XuanxueSection[] = [];

    const panelReg = /<div class="panel-heading">\s*<strong>基本信息<\/strong>\s*<\/div>\s*<div class="panel-body">([\s\S]*?)<\/div>/gi;
    let m: RegExpExecArray | null;
    let index = 0;

    while ((m = panelReg.exec(page)) !== null) {
        index += 1;
        const kv = parseKeyValues(m[1]);
        const name = kv['测算姓名：'] ?? '';
        const score = kv['姓名评分：'] ?? '';
        const brief = kv['姓名简批：'] ?? '';
        const total = kv['姓名总批：'] ?? '';
        const sancai = kv['三才：'] ?? '';

        if (!name && !score && !brief && !total && !sancai) continue;

        if (index === 1) {
            if (name) summary.push(`测算姓名：${name}`);
            if (score) summary.push(`姓名评分：${score}`);
            if (brief) summary.push(`姓名简批：${brief}`);
            if (total) summary.push(`姓名总批：${total}`);
        }

        const lines: string[] = [];
        if (score) lines.push(`姓名评分：${score}`);
        if (brief) lines.push(`姓名简批：${brief}`);
        if (total) lines.push(`姓名总批：${total}`);
        if (sancai) lines.push(`三才：${sancai}`);

        sections.push({
            title: name ? `候选 ${index}：${name}` : `候选 ${index}`,
            content: lines.join('\n') || '暂无摘要',
        });
    }

    if (sections.length > 1) {
        summary.push(`候选数量：${sections.length}`);
    }

    if (sections.length === 0) {
        return {
            summary: ['未解析到起名打分结果，请稍后重试。'],
            sections: [],
        };
    }

    return {
        summary,
        sections: sections.slice(0, 20),
    };
}

