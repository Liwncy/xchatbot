import type {XiuxianTowerRankRow, XiuxianTowerSeasonRankRow} from '../../core/types/index.js';
import {formatBeijingTime} from '../../core/utils/time.js';

export function towerClimbText(params: {
    floor: number;
    result: 'win' | 'lose';
    rounds: number;
    reward: {spiritStone: number; exp: number; cultivation: number};
    highestFloor: number;
    enemyName: string;
}): string {
    return [
        `${params.result === 'win' ? '🏆' : '💥'} 爬塔${params.result === 'win' ? '成功' : '失败'}：第 ${params.floor} 层`,
        '━━━━━━━━━━━━',
        `👾 守卫：${params.enemyName}`,
        `🕒 回合：${params.rounds}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
        `🗼 当前最高层：${params.highestFloor}`,
    ].join('\n');
}

export function towerFastClimbText(params: {
    requested: number;
    attempted: number;
    cleared: number;
    highestFloor: number;
    totalReward: {spiritStone: number; exp: number; cultivation: number};
    floorLines: string[];
    failedFloor?: number;
}): string {
    return [
        `⚡ 快速爬塔完成（请求 ${params.requested} 层）`,
        '━━━━━━━━━━━━',
        `🧪 实际挑战：${params.attempted} 层`,
        `✅ 成功通关：${params.cleared} 层`,
        ...(params.failedFloor ? [`💥 停止于：第 ${params.failedFloor} 层`] : ['🏁 本次未遇阻，已完成请求层数']),
        `🗼 当前最高层：${params.highestFloor}`,
        `💎 灵石 +${params.totalReward.spiritStone}`,
        `📈 经验 +${params.totalReward.exp}`,
        `✨ 修为 +${params.totalReward.cultivation}`,
        ...(params.floorLines.length ? ['━━━━━━━━━━━━', ...params.floorLines] : []),
        '💡 查看详情：修仙塔报 / 修仙塔详 [战报ID]',
    ].join('\n');
}

export function towerStatusText(progress: {highestFloor: number; lastResult: 'win' | 'lose' | null} | null): string {
    const highest = progress?.highestFloor ?? 0;
    const next = highest + 1;
    const last = progress?.lastResult === 'win' ? '胜利' : progress?.lastResult === 'lose' ? '失败' : '暂无';
    return [
        '🧭 爬塔状态',
        '━━━━━━━━━━━━',
        `🗼 最高层：${highest}`,
        `🎯 下一层：${next}`,
        `🧾 上次结果：${last}`,
        '💡 发送「修仙爬塔」挑战下一层',
    ].join('\n');
}

export function towerRankText(
    rows: XiuxianTowerRankRow[],
    self?: XiuxianTowerRankRow | null,
    limit?: number,
    ahead?: XiuxianTowerRankRow | null,
    scopeLabel?: string,
): string {
    if (!rows.length) return '🏔️ 当前暂无塔榜记录，快发送「修仙爬塔」抢首榜！';
    const lines = rows.map((v, i) => `#${i + 1} ${v.userName?.trim() || `道友${v.playerId}`} | 最高层:${v.highestFloor}`);
    const selfLine = self
        ? `🙋 你当前第 ${self.rank ?? '-'} 名 | 最高层:${self.highestFloor}`
        : '🙋 你暂未上榜，发送「修仙爬塔」参与挑战';
    const gapLine = self
        ? self.rank === 1
            ? '🥇 你已位列榜首'
            : ahead
                ? `📏 距离上一名：${ahead.userName?.trim() || `道友${ahead.playerId}`}，还差 ${Math.max(0, ahead.highestFloor - self.highestFloor)} 层`
                : '📏 暂无上一名数据'
        : '📏 上榜后可查看与上一名差距';
    return [`🏔️ ${scopeLabel ?? '总榜'}爬塔榜（Top ${limit ?? rows.length}）`, '━━━━━━━━━━━━', ...lines, '━━━━━━━━━━━━', selfLine, gapLine].join('\n');
}

export function towerSelfRankText(self: XiuxianTowerRankRow | null): string {
    if (!self) return '🙋 你尚未进入塔榜，发送「修仙爬塔」开始冲层。';
    return [
        '🙋 我的爬塔排名',
        '━━━━━━━━━━━━',
        `🧾 角色：${self.userName?.trim() || `道友${self.playerId}`}`,
        `🏅 排名：第 ${self.rank ?? '-'} 名`,
        `🗼 最高层：${self.highestFloor}`,
    ].join('\n');
}

export function towerSeasonKeyText(seasonKey: string): string {
    return [`🧩 当前爬塔赛季：${seasonKey}`, '💡 查看榜单：修仙季榜 / 修仙季榜 我'].join('\n');
}

export function towerSeasonStatusText(params: {
    seasonKey: string;
    settleAt: number;
    countdown: string;
    prevSeasonKey: string;
    prevRank?: number;
    prevClaimed: boolean;
}): string {
    return [
        `🕰️ 赛季状态：${params.seasonKey}`,
        '━━━━━━━━━━━━',
        `📅 结算时间：${formatBeijingTime(params.settleAt)}`,
        `⌛ 剩余时间：${params.countdown}`,
        `📦 上赛季：${params.prevSeasonKey}`,
        `🏅 上赛季排名：${params.prevRank ? `第 ${params.prevRank} 名` : '未上榜'}`,
        `🎁 上赛季奖励：${params.prevClaimed ? '已领取' : '未领取'}`,
        ...(params.prevRank && !params.prevClaimed ? ['💡 现在可发送「修仙季领」领取奖励'] : []),
    ].join('\n');
}

export function towerSeasonRankText(
    rows: XiuxianTowerSeasonRankRow[],
    self?: XiuxianTowerSeasonRankRow | null,
    limit?: number,
    ahead?: XiuxianTowerSeasonRankRow | null,
    seasonKeyHint?: string,
): string {
    const seasonKey = rows[0]?.seasonKey ?? self?.seasonKey ?? seasonKeyHint ?? '未知赛季';
    if (!rows.length) return `🌄 赛季 ${seasonKey} 暂无塔榜记录，快发送「修仙爬塔」冲榜吧！`;
    const lines = rows.map((v, i) => `#${i + 1} ${v.userName?.trim() || `道友${v.playerId}`} | 最高层:${v.highestFloor}`);
    const selfLine = self
        ? `🙋 你当前第 ${self.rank ?? '-'} 名 | 最高层:${self.highestFloor}`
        : '🙋 你暂未上榜，发送「修仙爬塔」参与挑战';
    const gapLine = self
        ? self.rank === 1
            ? '🥇 你已位列赛季榜首'
            : ahead
                ? `📏 距离上一名：${ahead.userName?.trim() || `道友${ahead.playerId}`}，还差 ${Math.max(0, ahead.highestFloor - self.highestFloor)} 层`
                : '📏 暂无上一名数据'
        : '📏 上榜后可查看与上一名差距';
    return [`🌄 赛季塔榜 ${seasonKey}（Top ${limit ?? rows.length}）`, '━━━━━━━━━━━━', ...lines, '━━━━━━━━━━━━', selfLine, gapLine].join('\n');
}

export function towerSeasonSelfRankText(self: XiuxianTowerSeasonRankRow | null, seasonKey: string): string {
    if (!self) return `🙋 赛季 ${seasonKey} 你尚未上榜，发送「修仙爬塔」开始冲层。`;
    return [
        `🙋 赛季 ${seasonKey} 我的塔榜数据`,
        '━━━━━━━━━━━━',
        `🧾 角色：${self.userName?.trim() || `道友${self.playerId}`}`,
        `🏅 排名：第 ${self.rank ?? '-'} 名`,
        `🗼 最高层：${self.highestFloor}`,
    ].join('\n');
}

export function towerSeasonRewardText(
    seasonKey: string,
    tiers: Array<{maxRank: number; spiritStone: number; exp: number; cultivation: number}>,
): string {
    const lines = tiers.map((v, i) => `${i + 1}. 前${v.maxRank}名：💎${v.spiritStone}  📈${v.exp}  ✨${v.cultivation}`);
    return [
        `🎖️ 赛季奖励说明（${seasonKey}）`,
        '━━━━━━━━━━━━',
        ...lines,
        '💡 结算后发送「修仙季领」领取上赛季奖励',
    ].join('\n');
}

export function towerSeasonClaimText(params: {
    seasonKey: string;
    rank: number;
    reward: {spiritStone: number; exp: number; cultivation: number};
    balanceAfter: number;
}): string {
    return [
        `🎁 赛季奖励领取成功（${params.seasonKey}）`,
        '━━━━━━━━━━━━',
        `🏅 你的排名：第 ${params.rank} 名`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
        `💼 当前灵石：${params.balanceAfter}`,
    ].join('\n');
}

export function towerSeasonAutoClaimNoticeText(params: {
    seasonKey: string;
    rank: number;
    reward: {spiritStone: number; exp: number; cultivation: number};
}): string {
    return [
        `🎁 已自动发放上赛季奖励（${params.seasonKey}）`,
        `🏅 排名：第 ${params.rank} 名`,
        `💎 +${params.reward.spiritStone}  📈 +${params.reward.exp}  ✨ +${params.reward.cultivation}`,
    ].join('\n');
}

export function towerLogText(
    logs: Array<{id: number; floor: number; result: 'win' | 'lose'; rounds: number; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📜 暂无爬塔战报，先发送「修仙爬塔」挑战吧。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        return `#${it.id} ${it.result === 'win' ? '🏆' : '💥'} 第${it.floor}层 | ${it.rounds}回合 | ${dt}`;
    });
    return [`📜 塔战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 详情：修仙塔详 [战报ID]'].join('\n');
}

export function towerDetailText(log: {id: number; floor: number; result: 'win' | 'lose'; rounds: number; battleLog: string}): string {
    const detail = log.battleLog
        .split('\n')
        .map((v: string) => v.trim())
        .filter(Boolean)
        .slice(0, 14);
    return [
        `🔎 塔战报 #${log.id}`,
        '━━━━━━━━━━━━',
        `🗼 层数：第 ${log.floor} 层`,
        `📌 结果：${log.result === 'win' ? '胜利' : '失败'}`,
        `🕒 回合：${log.rounds}`,
        ...detail,
    ].join('\n');
}