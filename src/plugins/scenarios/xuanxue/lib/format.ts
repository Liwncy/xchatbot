/** 格式化工具：emoji 映射、内容截取美化 */

export const BAZI_SECTION_EMOJI: Record<string, string> = {
    '基本信息': '🧾',
    '八字排盘': '🧮',
    '流年盘': '🌊',
    '流年细盘': '🗂️',
    '胎命身': '🪪',
    '四柱神煞': '🪬',
    '大运排盘': '🧭',
    '大运神煞': '✨',
    '喜用神分析': '🧭',
    '当日运势分析': '📆',
    '日柱论命': '📜',
    '先天纳音分析': '🌊',
    '财运分析': '💰',
    '姻缘分析': '💞',
    '运程分析': '🚀',
    '能量五行分析': '⚖️',
    '命运分析': '🔮',
};

export const BAZI_SUMMARY_EMOJI: Array<{prefix: string; emoji: string}> = [
    {prefix: '缘主姓名：', emoji: '👤'},
    {prefix: '出生公历：', emoji: '📅'},
    {prefix: '出生农历：', emoji: '🗓️'},
    {prefix: '八字生辰：', emoji: '🧬'},
    {prefix: '八字格局：', emoji: '🏷️'},
    {prefix: '生肖：', emoji: '🐾'},
    {prefix: '星宿信息：', emoji: '🌟'},
    {prefix: '命卦信息：', emoji: '🧿'},
    {prefix: '五行旺度：', emoji: '⚖️'},
    {prefix: '起运信息：', emoji: '🕒'},
];

export const HEHUN_SCORE_EMOJI: Record<string, string> = {
    '命宫': '🏠',
    '年支同气': '🌿',
    '月令合': '🌙',
    '日干相合': '☀️',
    '天干五合': '🌠',
    '子女同步': '👶',
    '总分': '🏆',
};

import {normalizeBasicValue} from './html.js';

export function withSectionEmoji(title: string): string {
    const emoji = BAZI_SECTION_EMOJI[title] ?? '✨';
    return `${emoji} ${title}`;
}

export function withSummaryEmoji(line: string): string {
    const normalized = normalizeBasicValue(line);
    for (const item of BAZI_SUMMARY_EMOJI) {
        if (normalized.startsWith(item.prefix)) {
            return `${item.emoji} ${normalized}`;
        }
    }
    return `• ${normalized}`;
}

/**
 * 把长文本按句号等断句，每句加 •，不截断。
 */
export function beautifySectionContent(content: string, maxSentences = Infinity, maxLength = Infinity): string {
    const normalized = content
        .replace(/\s+/g, ' ')
        .replace(/\s*([，。！？；：])/g, '$1')
        .trim();

    if (!normalized) return '暂无内容';

    const sentenceParts = normalized
        .split(/(?<=[。！？；])/)
        .map((item) => item.trim())
        .filter(Boolean);

    const picked = (maxSentences === Infinity ? sentenceParts : sentenceParts.slice(0, maxSentences))
        .map((item) => `• ${item}`);
    const text = picked.length > 0 ? picked.join('\n') : `• ${normalized}`;

    if (maxLength === Infinity || text.length <= maxLength) return text;
    return text;
}

