import type {CardText} from './model.js';
import {STAT_LABELS, bar, type MemberStats} from './stats.js';

/** 羁绊模型没起名时的备用名。 */
const BOND_FALLBACK = '常来常往';

/**
 * 拼成一条微信文字。微信是比例字体，进度条竖着对不齐，所以两项并一行、不指望对齐。
 * 模型没给的栏目整行不出现。
 */
export function renderMemberCard(name: string, stats: MemberStats, text: CardText): string {
    const lines: string[] = [
        `🎴【群友角色卡】${name}`,
        `称号：${text.title}`,
        `${stats.rarity}｜${text.cls}｜${text.camp}`,
    ];
    if (text.blurb) lines.push('', text.blurb);

    lines.push('');
    for (let index = 0; index < STAT_LABELS.length; index += 2) {
        const pair = STAT_LABELS.slice(index, index + 2)
            .map((label) => `${bar(stats.stars[label])} ${label}`);
        lines.push(pair.join('　'));
    }

    if (text.skills.length) {
        lines.push('', '技能', ...text.skills.map((skill) => `· ${skill.name}：${skill.text}`));
    }
    if (stats.bonds.length) {
        lines.push('', '羁绊', ...stats.bonds.map((bond) =>
            `@${bond.name} ${text.bonds.get(bond.id) ?? BOND_FALLBACK}，来往 ${bond.count} 回`));
    }

    const tail: string[] = [];
    if (text.highlight) tail.push(`高光：${text.highlight}`);
    if (text.quotes.length) tail.push(`台词：${text.quotes.map((quote) => `“${quote}”`).join('　')}`);
    if (text.weak) tail.push(`弱点：${text.weak}`);
    if (text.role) tail.push(`定位：${text.role}`);
    if (tail.length) lines.push('', ...tail);

    return lines.join('\n');
}
