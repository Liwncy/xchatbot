import type {CardRow} from './material.js';
import {rarityOf, type Rarity} from './lexicon.js';

export const STAT_LABELS = ['活跃', '话痨', '表情', '熬夜', '人气', '鸽王'] as const;
export type StatLabel = typeof STAT_LABELS[number];

export interface Bond {
    id: string;
    name: string;
    /** 他们之间互相回复、互相 @ 的次数加总。 */
    count: number;
}

export interface MemberStats {
    /** 他在这一批里的发言条数（不含机器人）。 */
    rows: number;
    textRows: number;
    /** 找机器人办事（# 口令）的次数。 */
    botCalls: number;
    avgLen: number;
    /** 图片和表情占他发言的比例。 */
    imageShare: number;
    /** 23 点到 5 点发的比例。 */
    nightShare: number;
    /** 他发过言的天数 / 群里有人发言的天数。 */
    attendance: number;
    activeDays: number;
    groupDays: number;
    /** 他最爱发言的钟点（东八区），没有就是 null。 */
    peakHour: number | null;
    speakers: number;
    stars: Record<StatLabel, number>;
    starSum: number;
    rarity: Rarity;
    bonds: Bond[];
}

const HOUR = 3600;
const DAY = 86400;
const CST = 8 * HOUR;
/** 来往不到这个数的不算羁绊。 */
const BOND_MIN = 3;
const BOND_MAX = 2;

export function isCommandText(text: string): boolean {
    return /^[#＃]/u.test(text.trim());
}

function isHuman(row: CardRow, botIds: Set<string>): boolean {
    if (row.actorType === 'bot') return false;
    if (!row.senderId || row.senderId === 'unknown') return false;
    return !botIds.has(row.senderId);
}

function dayOf(unix: number): number {
    return Math.floor((unix + CST) / DAY);
}

function hourOf(unix: number): number {
    return Math.floor(((unix + CST) % DAY) / HOUR);
}

/** 阈值数组每超过一个就多一颗星：1–5。 */
export function stepStars(value: number, thresholds: [number, number, number, number]): number {
    return 1 + thresholds.filter((limit) => value >= limit).length;
}

/** 在一群人里排第几：最低 1 星，最高 5 星。人太少（不到 3 个）比不出来，给 3 星。 */
export function rankStars(value: number, all: number[]): number {
    if (all.length < 3) return 3;
    const lower = all.filter((item) => item < value).length;
    return Math.min(5, 1 + Math.floor((lower / (all.length - 1)) * 5));
}

interface Tally {
    rows: number;
    textRows: number;
    textChars: number;
    received: number;
}

export function computeStats(rows: CardRow[], targetId: string, botIds: Set<string>): MemberStats {
    const senderOf = new Map<string, string>();
    for (const row of rows) senderOf.set(row.messageId, row.senderId);

    const humans = rows.filter((row) => isHuman(row, botIds));
    const tally = new Map<string, Tally>();
    const entry = (id: string): Tally => {
        let value = tally.get(id);
        if (!value) {
            value = {rows: 0, textRows: 0, textChars: 0, received: 0};
            tally.set(id, value);
        }
        return value;
    };
    const names = new Map<string, string>();
    const bondCounts = new Map<string, number>();
    const groupDays = new Set<number>();
    const mineDays = new Set<number>();
    const hourBuckets = new Array<number>(24).fill(0);
    let image = 0;
    let night = 0;
    let botCalls = 0;

    for (const row of humans) {
        const mine = row.senderId === targetId;
        const self = entry(row.senderId);
        self.rows += 1;
        if (row.senderName) names.set(row.senderId, row.senderName);
        groupDays.add(dayOf(row.createdAt));
        const command = row.msgType === 'text' && isCommandText(row.text);
        if (row.msgType === 'text' && !command && row.text.trim()) {
            self.textRows += 1;
            self.textChars += Array.from(row.text.trim()).length;
        }
        for (const [id, name] of row.mentionNames) if (!names.has(id)) names.set(id, name);

        // 这一条冲着谁来的：回复了谁的话、@ 了谁
        const touched = new Set<string>();
        const owner = row.referMessageId ? senderOf.get(row.referMessageId) : undefined;
        if (owner) touched.add(owner);
        for (const id of row.mentionIds) touched.add(id);
        touched.delete(row.senderId);
        for (const id of [...touched]) if (!id || botIds.has(id)) touched.delete(id);
        for (const id of touched) entry(id).received += 1;

        if (mine) {
            mineDays.add(dayOf(row.createdAt));
            hourBuckets[hourOf(row.createdAt)] += 1;
            if (row.msgType === 'image' || row.msgType === 'emoji') image += 1;
            const hour = hourOf(row.createdAt);
            if (hour >= 23 || hour < 5) night += 1;
            if (command) botCalls += 1;
            for (const id of touched) bondCounts.set(id, (bondCounts.get(id) ?? 0) + 1);
        } else if (touched.has(targetId)) {
            bondCounts.set(row.senderId, (bondCounts.get(row.senderId) ?? 0) + 1);
        }
    }

    const me = entry(targetId);
    const speakers = [...tally.entries()].filter(([, value]) => value.rows > 0);
    const avg = (value: Tally): number => value.textRows ? value.textChars / value.textRows : 0;
    const attendance = groupDays.size ? mineDays.size / groupDays.size : 0;
    const imageShare = me.rows ? image / me.rows : 0;
    const nightShare = me.rows ? night / me.rows : 0;

    const stars: Record<StatLabel, number> = {
        活跃: rankStars(me.rows, speakers.map(([, value]) => value.rows)),
        话痨: rankStars(avg(me), speakers.map(([, value]) => avg(value))),
        表情: stepStars(imageShare, [0.03, 0.1, 0.2, 0.35]),
        熬夜: stepStars(nightShare, [0.03, 0.08, 0.15, 0.3]),
        人气: rankStars(me.received, speakers.map(([, value]) => value.received)),
        鸽王: stepStars(1 - attendance, [0.2, 0.4, 0.6, 0.8]),
    };
    const starSum = STAT_LABELS.reduce((sum, label) => sum + stars[label], 0);

    const peak = Math.max(...hourBuckets);
    const bonds = [...bondCounts.entries()]
        .filter(([id, count]) => count >= BOND_MIN && id !== targetId && !botIds.has(id))
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, BOND_MAX)
        .map(([id, count]) => ({id, name: names.get(id) ?? id, count}));

    return {
        rows: me.rows,
        textRows: me.textRows,
        botCalls,
        avgLen: Math.round(avg(me)),
        imageShare,
        nightShare,
        attendance,
        activeDays: mineDays.size,
        groupDays: groupDays.size,
        peakHour: peak > 0 ? hourBuckets.indexOf(peak) : null,
        speakers: speakers.length,
        stars,
        starSum,
        rarity: rarityOf(starSum),
        bonds,
    };
}

/** 给模型看的统计摘要。数字是代码算的，模型只拿来写，不重算。 */
export function describeStats(stats: MemberStats): string {
    const percent = (value: number): string => `${Math.round(value * 100)}%`;
    const lines = [
        `发言 ${stats.rows} 条（群里 ${stats.speakers} 人说过话），其中文字 ${stats.textRows} 条，平均每条 ${stats.avgLen} 字`,
        `图片和表情占 ${percent(stats.imageShare)}，深夜（23 点到 5 点）占 ${percent(stats.nightShare)}`,
        `最常在 ${stats.peakHour === null ? '（不明）' : `${stats.peakHour} 点`}发言`,
        `群里有人说话的 ${stats.groupDays} 天里，他出现了 ${stats.activeDays} 天`,
        `找机器人办事 ${stats.botCalls} 次`,
        `星数（满 5）：${STAT_LABELS.map((label) => `${label}${stats.stars[label]}`).join('，')}`,
    ];
    if (stats.bonds.length) {
        lines.push(`来往最多的人：${stats.bonds.map((bond) => `${bond.name}（id ${bond.id}，${bond.count} 回）`).join('，')}`);
    }
    return lines.join('\n');
}

export function bar(stars: number): string {
    const full = Math.max(0, Math.min(5, Math.round(stars)));
    return '▰'.repeat(full) + '▱'.repeat(5 - full);
}
