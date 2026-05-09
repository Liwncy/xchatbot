import {getFortuneConfig, nextRerollCost, type XiuxianFortuneBuff, type XiuxianFortuneLevel} from './buff.js';

function formatFortuneBuffLines(buff: XiuxianFortuneBuff): string[] {
    const fmtPct = (v: number): string => {
        if (!v) return '0%';
        const pct = Math.round(v * 1000) / 10;
        return `${pct > 0 ? '+' : ''}${pct}%`;
    };
    const fmtAbs = (v: number): string => {
        if (!v) return '+0%';
        const pct = Math.round(v * 1000) / 10;
        return `${pct > 0 ? '+' : ''}${pct}%`;
    };
    return [
        `🧘 修炼效率 ${fmtPct(buff.cultivateRate)}`,
        `🧭 探索灵石 ${fmtPct(buff.exploreRate)}`,
        `⚔️ 战斗攻击 ${fmtPct(buff.battleAttack)}`,
        `🎯 暴击概率 ${fmtAbs(buff.battleCrit)}`,
        `🎁 战斗奖励 ${fmtPct(buff.battleReward)}`,
    ];
}

export function fortuneDrawText(params: {
    level: XiuxianFortuneLevel;
    buff: XiuxianFortuneBuff;
    sign: string;
    dayKey: string;
    reroll?: {cost: number; totalSpent: number; count: number};
}): string {
    const cfg = getFortuneConfig(params.level);
    const title = params.reroll ? '🔄 改运成功' : '🔮 今日运势';
    const headerNote = params.reroll
        ? `💸 本次改运消耗灵石 ${params.reroll.cost}，累计改运 ${params.reroll.count} 次，累计消耗 ${params.reroll.totalSpent}`
        : `📅 日期：${params.dayKey}`;
    const next = nextRerollCost(params.reroll?.count ?? 0);
    const nextHint = next == null ? '✅ 今日改运次数已达上限' : `⏭️ 再次改运需灵石 ${next}，发送「修仙改运」继续`;
    return [
        title,
        '━━━━━━━━━━━━',
        `${cfg.emoji} 运势：${cfg.title}`,
        headerNote,
        params.sign ? `🪧 签文：${params.sign}` : '',
        '━━━━━━━━━━━━',
        ...formatFortuneBuffLines(params.buff),
        ...(cfg.note ? ['━━━━━━━━━━━━', `📝 ${cfg.note}`] : []),
        '━━━━━━━━━━━━',
        nextHint,
    ]
        .filter(Boolean)
        .join('\n');
}

export function fortuneStatusText(params: {
    level: XiuxianFortuneLevel;
    buff: XiuxianFortuneBuff;
    sign: string;
    dayKey: string;
    rerollCount: number;
    rerollSpent: number;
}): string {
    const cfg = getFortuneConfig(params.level);
    const next = nextRerollCost(params.rerollCount);
    const nextHint = next == null ? '✅ 今日改运次数已达上限' : `⏭️ 下次改运需灵石 ${next}，发送「修仙改运」继续`;
    return [
        '📊 当前运势',
        '━━━━━━━━━━━━',
        `${cfg.emoji} 运势：${cfg.title}`,
        `📅 日期：${params.dayKey}`,
        params.sign ? `🪧 签文：${params.sign}` : '',
        params.rerollCount > 0 ? `🔄 今日改运 ${params.rerollCount} 次，累计消耗灵石 ${params.rerollSpent}` : '',
        '━━━━━━━━━━━━',
        ...formatFortuneBuffLines(params.buff),
        '━━━━━━━━━━━━',
        nextHint,
    ]
        .filter(Boolean)
        .join('\n');
}

export function fortuneNotYetText(): string {
    return ['🕳️ 今日尚未占卜', '💡 发送「修仙占卜」获取今日运势'].join('\n');
}

export function fortuneAlreadyDrewText(): string {
    return ['🧾 今日已占卜过一次，明日可再次占卜', '💡 发送「修仙运势」查看当前效果', '💡 发送「修仙改运」可消耗灵石重抽'].join('\n');
}

export function fortuneRerollCapText(rerollCount: number, rerollSpent: number): string {
    return [
        '⛔ 今日改运次数已达上限',
        `📌 已改运 ${rerollCount} 次，累计消耗灵石 ${rerollSpent}`,
        '💡 发送「修仙运势」查看当前效果',
    ].join('\n');
}

export function fortuneRerollNotEnoughText(cost: number, balance: number): string {
    return [`💸 灵石不足，无法改运：需要 ${cost}，当前 ${balance}`, '💡 发送「修仙运势」查看当前效果'].join('\n');
}
