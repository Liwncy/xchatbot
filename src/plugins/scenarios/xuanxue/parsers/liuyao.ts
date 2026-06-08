/** 六爻排盘 HTML 解析器 */

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
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(page.length, start + 260000);
    return page.slice(start, end);
}

function stripHtmlWithBreaks(input: string): string {
    return stripHtml(
        input
            .replace(/&nbsp;/g, ' ')
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
        .slice(0, 24);
}

/**
 * 解析单个 gua-line div，返回格式化的一行文字。
 * 主卦结构：六神 span | 伏神 span | 六亲文本（裸文本节点）| img | 动爻(O/X) | 世/应 span
 * 变卦结构：六亲 span | img | 世/应 span
 */
function parseGuaLine(divHtml: string, hasLiushen: boolean): string {
    // 解码 &nbsp; 再操作
    const h = divHtml.replace(/&nbsp;/g, ' ');

    // 提取所有 span 文本
    const spanTexts: string[] = [];
    const spanReg = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = spanReg.exec(h)) !== null) {
        const t = stripHtml(m[1]).replace(/\s+/g, ' ').trim();
        spanTexts.push(t);
    }

    // 卦线图片：1.jpg = 阳爻（实线），0.jpg = 阴爻（断线）
    const imgMatch = h.match(/<img src="[^"]*\/([01])\.jpg"/i);
    const guaSymbol = imgMatch ? (imgMatch[1] === '1' ? '━━━━━━' : '━━ ━━') : '';

    // 动爻标记（O = 老阳变阴，X = 老阴变阳），在 img 之后裸文本中
    const motionMatch = h.match(/alt="gua-line"[^>]*>\s*([OX])\s*/i);
    const motion = motionMatch ? ` ${motionMatch[1]}` : '  ';

    if (hasLiushen) {
        // 主卦：span[0]=六神, span[1]=伏神（可能为空格）, span[2]=世/应
        // 六亲是第二个 span 和 img 之间的裸文本
        const liushen = spanTexts[0] ?? '';
        const fushen = (spanTexts[1] ?? '').replace(/\s+/g, '').trim(); // &nbsp; → 空
        const shiying = (spanTexts[2] ?? '').trim();

        // 六亲是所有 span 之后、img 之前的裸文本
        // 从最后一个 </span> 到 <img 之间提取六亲（去掉 HTML 注释）
        const imgIdx2 = h.indexOf('<img');
        const lastSpanEnd2 = h.lastIndexOf('</span>', imgIdx2);
        const rawBetween = (lastSpanEnd2 >= 0 && imgIdx2 > lastSpanEnd2)
            ? stripHtml(h.slice(lastSpanEnd2 + 7, imgIdx2)).replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
            : '';
        const liuqin = rawBetween;

        const fuStr = fushen ? `[${fushen}]` : '          ';
        return `${liushen.padEnd(3)} ${fuStr.padEnd(10)} ${liuqin.padEnd(8)} ${guaSymbol}${motion}${shiying}`;
    } else {
        // 变卦：span[0]=六亲, span[1]=世/应
        const liuqin = spanTexts[0] ?? '';
        const shiying = (spanTexts[1] ?? '').trim();
        return `${liuqin.padEnd(8)} ${guaSymbol}${motion}${shiying}`;
    }
}

/**
 * 将一个 col-md-12 div（主卦或变卦）解析为格式化文字块。
 */
function parseGuaBlock(colHtml: string): string {
    const h = colHtml.replace(/&nbsp;/g, ' ');
    const lines: string[] = [];

    // --- 卦名标题 ---
    const titleMatch = h.match(/<strong>([\s\S]*?)<\/strong>/);
    if (titleMatch) {
        const title = stripHtml(titleMatch[1]).replace(/\s+/g, ' ').trim();
        const gongMatch = h.match(/<font[^>]*>\(([^)]+)\)<\/font>/);
        const gong = gongMatch ? `（${gongMatch[1]}）` : '';
        lines.push(title + gong, '');
    }

    // --- 判断是否为主卦（有六神列）---
    // 主卦标题含「主　卦」（中间可能有空格/&nbsp;），变卦含「变　卦」
    const isMain = /主\s*卦/.test(h) && /六神/.test(h);

    if (isMain) {
        lines.push('六神  伏神          六亲       卦线    动 世/应');
        lines.push('─'.repeat(44));
    } else {
        lines.push('六亲          卦线     世/应');
        lines.push('─'.repeat(28));
    }

    // --- 解析每一行卦线 ---
    const guaLineDivReg = /<div class="gua-line">([\s\S]*?)<\/div>\s*(?=\s*(?:<div|$))/gi;
    let gm: RegExpExecArray | null;
    while ((gm = guaLineDivReg.exec(h)) !== null) {
        const row = parseGuaLine(gm[1], isMain);
        if (row.trim()) lines.push(row);
    }

    lines.push('');

    // --- 文字解读段落（象曰/爻辞/解卦/事业等）---
    // 找所有 gua-line div 结束的位置之后的内容
    // gua-line 的结构是 <div class="gua-line">...</div>，找最后一个匹配的结束位置
    const lastGuaLineEnd = (() => {
        let pos = -1;
        let search = 0;
        while (true) {
            const idx = h.indexOf('<div class="gua-line">', search);
            if (idx < 0) break;
            // 找对应的 </div>
            const closeIdx = h.indexOf('</div>', idx);
            if (closeIdx < 0) break;
            pos = closeIdx + 6;
            search = pos;
        }
        return pos;
    })();
    const afterDiv = lastGuaLineEnd > 0 ? h.slice(lastGuaLineEnd) : '';
    const paras = stripHtml(
        afterDiv
            .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, inner) => {
                // inner 可能是 "【象曰】：" 或 "象曰："，统一成 "【xxx】"
                const text = stripHtml(inner).replace(/\s+/g, '').replace(/[【】：:]/g, '');
                return `\n【${text}】`;
            })
            .replace(/<br\s*\/?>/gi, '\n'),
    )
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    lines.push(...paras);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseLiuyaoSections(fragment: string): XuanxueSection[] {
    const panelMarker = '<div class="panel-heading"><strong>六爻排盘</strong></div>';
    const panelStart = fragment.indexOf(panelMarker);
    if (panelStart < 0) return [];

    const bodyStart = fragment.indexOf('<div class="panel-body">', panelStart);
    if (bodyStart < 0) return [];
    const contentStart = bodyStart + '<div class="panel-body">'.length;

    const nextPanel = fragment.indexOf('<div class="panel panel-default">', contentStart);
    const end = nextPanel > contentStart ? nextPanel : fragment.length;
    const block = fragment.slice(contentStart, end);

    const sections: XuanxueSection[] = [];

    // col-md-12 分块（主卦在前，变卦在后，用 <hr> 分隔）
    const colReg = /<div class="col-md-12">([\s\S]*?)(?=<div class="col-md-12">|<\/div>\s*<\/div>\s*<\/div>|$)/gi;
    let cm: RegExpExecArray | null;
    while ((cm = colReg.exec(block)) !== null) {
        const colHtml = cm[1];
        if (!colHtml.includes('gua-line')) continue;

        const decoded = colHtml.replace(/&nbsp;/g, ' ');
        const isMain = /主\s*卦/.test(decoded) && /六神/.test(decoded);
        const isChange = /变\s*卦/.test(decoded);
        const label = isMain ? '主卦' : isChange ? '变卦' : '排盘';

        const content = parseGuaBlock(colHtml);
        if (content) {
            sections.push({title: `六爻排盘·${label}`, content});
        }
    }

    if (sections.length === 0) {
        // fallback
        const raw = stripHtmlWithBreaks(block)
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
        return [{title: '六爻排盘', content: raw}];
    }

    return sections;
}

export function parseLiuyaoHtml(page: string): BaziParsedResult {
    const fragment = extractResultFragment(page);
    const summary = parseBasicSummary(fragment);
    const sections = parseLiuyaoSections(fragment);

    return {summary, sections};
}
