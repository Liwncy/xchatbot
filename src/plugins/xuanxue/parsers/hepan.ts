/** 八字合盘 HTML 解析器 */

import {stripHtml, normalizeBasicValue} from '../lib/html.js';
import type {HeHunParsedResult, HeHunScoreItem} from './hehun.js';

const EMPTY_PLACEHOLDER = '—';
const HASH_PLACEHOLDER = '·';

function extractTableRows(tableHtml: string): string[] {
    const rows: string[] = [];
    const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trReg.exec(tableHtml)) !== null) {
        const cells: string[] = [];
        const tdReg = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        let td: RegExpExecArray | null;
        while ((td = tdReg.exec(tr[1])) !== null) {
            const raw = normalizeBasicValue(stripHtml(td[1]));
            const value = raw === '' ? EMPTY_PLACEHOLDER : raw === '#' ? HASH_PLACEHOLDER : raw;
            cells.push(value);
        }
        if (cells.length > 1) rows.push(cells.join('  '));
    }
    return rows;
}

function pickPersonInfo(html: string, prefix: '甲方' | '乙方') {
    const headingReg = new RegExp(
        `<div class="panel-heading">\\s*<strong>${prefix}命盘<\\/strong>\\s*<\\/div>`,
        'i',
    );
    const headingMatch = headingReg.exec(html);
    if (!headingMatch) return {name: '', lines: [], tableRows: []};

    const start = headingMatch.index + headingMatch[0].length;
    // 结果页内容较长，扩大截取范围，避免命盘信息被截断
    const fragment = html.slice(start, start + 12000);

    const bodyStart = fragment.indexOf('<div class="panel-body">');
    const tableStart = fragment.indexOf('<table');
    const bodyFragment =
        bodyStart >= 0
            ? fragment.slice(bodyStart, tableStart >= 0 ? tableStart : undefined)
            : fragment.slice(0, tableStart >= 0 ? tableStart : 2000);

    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const lines: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pReg.exec(bodyFragment)) !== null) {
        const text = normalizeBasicValue(stripHtml(m[1]));
        if (text) lines.push(text);
    }

    const tableEnd = fragment.indexOf('</table>');
    const tableHtml =
        tableStart >= 0 && tableEnd >= 0 ? fragment.slice(tableStart, tableEnd + '</table>'.length) : '';
    const tableRows = tableHtml ? extractTableRows(tableHtml) : [];

    const name = lines[0]?.replace(/^(甲方|乙方)姓名[：:]/, '').trim() ?? '';
    return {name, lines, tableRows};
}

function pickScores(html: string): {scores: HeHunScoreItem[]; totalScore: string} {
    const headingIdx = html.indexOf('<strong>合盘结果</strong>');
    // 合盘详批段落很长，扩大窗口，减少评分项丢失
    const fragment = headingIdx >= 0 ? html.slice(headingIdx, headingIdx + 50000) : html;

    const bodyStart = fragment.indexOf('<div class="panel-body">');
    const bodyEnd = fragment.indexOf('返回重测');
    const panelHtml =
        bodyStart >= 0 ? fragment.slice(bodyStart, bodyEnd >= 0 ? bodyEnd : undefined) : fragment;

    const paras: string[] = [];
    const paraReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = paraReg.exec(panelHtml)) !== null) {
        const txt = normalizeBasicValue(stripHtml(m[1])).trim();
        if (txt) paras.push(txt);
    }

    const scores: HeHunScoreItem[] = [];
    let totalScore = '';
    let i = 0;

    while (i < paras.length) {
        const para = paras[i];
        if (para.match(/^总分[：:]/)) {
            totalScore = para.replace(/^总分[：:]/, '').trim();
            i++;
            continue;
        }
        const scoreLineMatch = para.match(/^(.+?)[：:]\s*(-?\d+(?:分)?)$/);
        if (scoreLineMatch) {
            const label = scoreLineMatch[1].trim();
            const score = scoreLineMatch[2].trim();
            const descLines: string[] = [];
            i++;
            while (i < paras.length) {
                const next = paras[i];
                if (next.match(/^.+?[：:]\s*-?\d+(?:分)?$/) || next.match(/^总分[：:]/)) break;
                descLines.push(next);
                i++;
            }
            scores.push({label, score, detail: descLines.join(' ')});
        } else {
            i++;
        }
    }

    if (scores.length === 0) {
        const scoreReg = /<strong>([^<：:]+)[：:]?<\/strong>\s*<font[^>]*>([^<]+)<\/font>/gi;
        let fm: RegExpExecArray | null;
        while ((fm = scoreReg.exec(panelHtml)) !== null) {
            const label = stripHtml(fm[1]).replace(/[：:]$/, '').trim();
            const score = stripHtml(fm[2]).trim();
            if (label === '总分') {
                totalScore = score;
                continue;
            }
            scores.push({label, score, detail: ''});
        }
    }

    return {scores, totalScore};
}

export function parseHePanHtml(page: string): HeHunParsedResult {
    const male = pickPersonInfo(page, '甲方');
    const female = pickPersonInfo(page, '乙方');
    const {scores, totalScore} = pickScores(page);
    return {male, female, scores, totalScore};
}

