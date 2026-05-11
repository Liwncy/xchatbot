/** 解析分发器：根据 rule.parse.mode 调用对应解析器 */

import {getByJsonPath} from '../../common/shared.js';
import {stripHtml} from '../lib/html.js';
import {parseBaziHtml} from '../parsers/bazi.js';
import {parseHeHunHtml} from '../parsers/hehun.js';
import {parseHePanHtml} from '../parsers/hepan.js';
import {parsePaipanHtml} from '../parsers/paipan.js';
import {parseJingpanHtml} from '../parsers/jingpan.js';
import {parseCaiyunHtml} from '../parsers/caiyun.js';
import {parseZhanbuHtml} from '../parsers/zhanbu.js';
import type {BaziParsedResult} from '../parsers/bazi.js';
import type {HeHunParsedResult} from '../parsers/hehun.js';
import type {XuanxueRule} from '../types.js';

export type {BaziParsedResult, HeHunParsedResult};
export type ParsedResult = string | BaziParsedResult | HeHunParsedResult;

export function parsePage(rule: XuanxueRule, page: string): ParsedResult {
    const config = rule.parse;

    if (config.mode === 'text') {
        return page.trim();
    }

    if (config.mode === 'regex') {
        if (!config.pattern) throw new Error('regex 解析缺少 pattern');
        const reg = new RegExp(config.pattern, config.flags ?? '');
        const match = page.match(reg);
        if (!match) throw new Error('regex 未匹配到内容');
        return (match[config.group ?? 1] ?? '').trim();
    }

    if (config.mode === 'htmlText') {
        const cleaned = stripHtml(page).replace(/\s+/g, ' ').trim();
        const maxLength = config.maxLength ?? 600;
        return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
    }

    if (config.mode === 'baziHtml') {
        return parseBaziHtml(page);
    }

    if (config.mode === 'heHunHtml') {
        return parseHeHunHtml(page);
    }

    if (config.mode === 'hePanHtml') {
        return parseHePanHtml(page);
    }

    if (config.mode === 'paipanHtml') {
        return parsePaipanHtml(page);
    }

    if (config.mode === 'jingpanHtml') {
        return parseJingpanHtml(page);
    }

    if (config.mode === 'caiyunHtml') {
        return parseCaiyunHtml(page);
    }

    if (config.mode === 'zhanbuHtml') {
        return parseZhanbuHtml(page);
    }

    // jsonPath
    if (!config.path) throw new Error('jsonPath 解析缺少 path');
    const json = JSON.parse(page) as unknown;
    const value = getByJsonPath(json, config.path);
    return String(value ?? '').trim();
}

