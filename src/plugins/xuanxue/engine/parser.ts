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
import {parseDaliurenHtml} from '../parsers/daliuren.js';
import {parseWeilaiHtml} from '../parsers/weilai.js';
import {parseZwpanHtml} from '../parsers/zwpan.js';
import {parseQimenHtml} from '../parsers/qimen.js';
import {parseXingpanHtml} from '../parsers/xingpan.js';
import {parseJinkoujueHtml} from '../parsers/jinkoujue.js';
import {parseMeihuaHtml} from '../parsers/meihua.js';
import {parseLiuyaoHtml} from '../parsers/liuyao.js';
import {parseGenericPanelHtml} from '../parsers/generic-panel.js';
import type {BaziParsedResult} from '../parsers/bazi.js';
import type {HeHunParsedResult} from '../parsers/hehun.js';
import type {XuanxueRule} from '../types.js';

export type {BaziParsedResult, HeHunParsedResult};
export type ParsedResult = string | BaziParsedResult | HeHunParsedResult;

/** summary 字段标签映射表（通用 panel 结构解析器使用） */
const GENERIC_PANEL_LABELS: Record<string, string[]> = {
    jiuxingHtml:  ['缘主姓名：', '出生公历：', '出生农历：', '风水命：', '九星为：'],
    shengriHtml:  ['公历生日：', '生日简介：', '静思语：', '优点：', '缺点：'],
    guxiangHtml:  ['缘主姓名：', '出生公历：', '出生农历：', '缘主骨相：'],
    chengguHtml:  ['缘主姓名：', '出生公历：', '出生农历：', '缘主称骨：'],
    liudaoHtml:   ['缘主姓名：', '出生公历：', '出生农历：'],
    zhengyuanHtml: ['缘主姓名：', '出生公历：', '出生农历：'],
    yinyuanHtml:  ['缘主姓名：', '出生公历：', '出生农历：'],
    mingyunHtml:   ['缘主姓名：', '出生公历：', '出生农历：'],
    caiyunYuceHtml: ['缘主姓名：', '出生公历：', '出生农历：', '财运批示：'],
    jiehunHtml:    ['缘主姓名：', '出生公历：', '出生农历：', '所属十星：', '结婚年龄：', '单身年龄：'],
};

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

    if (config.mode === 'baziHtml') return parseBaziHtml(page);
    if (config.mode === 'heHunHtml') return parseHeHunHtml(page);
    if (config.mode === 'hePanHtml') return parseHePanHtml(page);
    if (config.mode === 'paipanHtml') return parsePaipanHtml(page);
    if (config.mode === 'jingpanHtml') return parseJingpanHtml(page);
    if (config.mode === 'caiyunHtml') return parseCaiyunHtml(page);
    if (config.mode === 'zhanbuHtml') return parseZhanbuHtml(page);
    if (config.mode === 'daliurenHtml') return parseDaliurenHtml(page);
    if (config.mode === 'weilaiHtml') return parseWeilaiHtml(page);
    if (config.mode === 'zwpanHtml') return parseZwpanHtml(page);
    if (config.mode === 'qimenHtml') return parseQimenHtml(page);
    if (config.mode === 'xingpanHtml') return parseXingpanHtml(page);
    if (config.mode === 'jinkoujueHtml') return parseJinkoujueHtml(page);
    if (config.mode === 'meihuaHtml') return parseMeihuaHtml(page);
    if (config.mode === 'liuyaoHtml') return parseLiuyaoHtml(page);

    // 通用 panel 结构解析（jiuxingHtml / shengriHtml / guxiangHtml / chengguHtml）
    const genericLabels = GENERIC_PANEL_LABELS[config.mode];
    if (genericLabels) return parseGenericPanelHtml(page, genericLabels);

    // jsonPath
    if (!config.path) throw new Error('jsonPath 解析缺少 path');
    const json = JSON.parse(page) as unknown;
    const value = getByJsonPath(json, config.path);
    return String(value ?? '').trim();
}
