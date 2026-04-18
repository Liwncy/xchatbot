import type {XiuxianBossLog, XiuxianWorldBossContribution, XiuxianWorldBossState} from '../../core/types/index.js';
import {XIUXIAN_TERMS} from '../../core/constants/index.js';
import {formatRealm} from '../../core/utils/realm.js';
import {formatBeijingTime} from '../../core/utils/time.js';

export function bossRaidText(params: {
    bossName: string;
    result: 'win' | 'lose';
    rounds: number;
    damage: number;
    hpBefore: number;
    hpAfter: number;
    reward: {gainedStone: number; gainedExp: number; gainedCultivation: number};
    dropName?: string;
}): string {
    return [
        `${params.result === 'win' ? '🏆 讨伐成功' : '💥 讨伐失利'}：${params.bossName}`,
        '━━━━━━━━━━━━',
        `🕒 回合：${params.rounds}`,
        `🗡️ 本次伤害：${params.damage}`,
        `❤️ BOSS血量：${params.hpBefore} -> ${params.hpAfter}`,
        `💎 灵石 +${params.reward.gainedStone}`,
        `📈 经验 +${params.reward.gainedExp}`,
        `✨ 修为 +${params.reward.gainedCultivation}`,
        ...(params.dropName ? [`🎁 掉落：${params.dropName}`] : []),
        '💡 战报：修仙伐报 / 修仙伐详 [战报ID]',
    ].join('\n');
}

export function worldBossStatusText(
    state: XiuxianWorldBossState,
    self?: XiuxianWorldBossContribution | null,
    extra?: {respawnLeftSec?: number; cycleNo?: number},
): string {
    return [
        `📢 世界BOSS：${state.bossName}`,
        '━━━━━━━━━━━━',
        `🔁 轮次：第 ${extra?.cycleNo ?? state.cycleNo} 轮`,
        `🪪 ${XIUXIAN_TERMS.realm.label}：${formatRealm(state.bossLevel)}`,
        `❤️ 血量：${state.currentHp}/${state.maxHp}`,
        `📌 状态：${state.status === 'alive' ? '存活' : '已击败，等待重生'}`,
        ...(state.status === 'defeated' ? [`⌛ 重生倒计时：${extra?.respawnLeftSec ?? 0}s`] : []),
        ...(self
            ? [`🗡️ 你的总伤害：${self.totalDamage}`, `⚔️ 你的出手：${self.attacks}`, `🏁 你的尾刀：${self.killCount}`]
            : ['🗡️ 你暂未参与本轮讨伐']),
    ].join('\n');
}

export function worldBossRankText(
    rows: XiuxianWorldBossContribution[],
    self?: XiuxianWorldBossContribution | null,
    extra?: {killerName?: string; defeatedAt?: number; limit?: number; respawnLeftSec?: number},
): string {
    if (!rows.length) return '🏅 本轮暂无讨伐记录，快发送「修仙讨伐」抢首刀！';
    const lines = rows.map((v, i) => {
        const name = v.userName?.trim() || `道友${v.playerId}`;
        return `#${i + 1} ${name} | 伤害:${v.totalDamage} | 出手:${v.attacks} | 尾刀:${v.killCount}`;
    });
    const footer = self
        ? `🙋 你当前第 ${self.rank ?? '-'} 名 | 伤害:${self.totalDamage} | 出手:${self.attacks} | 尾刀:${self.killCount}`
        : '🙋 你尚未上榜，发送「修仙讨伐」参与本轮挑战';
    const killInfo =
        extra?.killerName && extra.defeatedAt
            ? `☠️ 尾刀：${extra.killerName} | 🕒 击杀时间：${formatBeijingTime(extra.defeatedAt)} | ⌛ 重生：${extra.respawnLeftSec ?? 0}s`
            : '☠️ 本轮BOSS尚未被击杀';
    return [
        `🏅 世界BOSS贡献榜（Top ${extra?.limit ?? rows.length}）`,
        '━━━━━━━━━━━━',
        ...lines,
        '━━━━━━━━━━━━',
        footer,
        killInfo,
    ].join('\n');
}

export function worldBossSelfRankText(self: XiuxianWorldBossContribution | null, cycleNo: number): string {
    if (!self) return `🙋 第 ${cycleNo} 轮你暂未上榜，发送「修仙讨伐」参与本轮挑战。`;
    const name = self.userName?.trim() || `道友${self.playerId}`;
    return [
        `🙋 第 ${cycleNo} 轮我的BOSS数据`,
        '━━━━━━━━━━━━',
        `🧾 角色：${name}`,
        `🏅 排名：第 ${self.rank ?? '-'} 名`,
        `🗡️ 伤害：${self.totalDamage}`,
        `⚔️ 出手：${self.attacks}`,
        `☠️ 尾刀：${self.killCount}`,
    ].join('\n');
}

export function bossLogText(logs: XiuxianBossLog[], page: number, pageSize: number): string {
    if (!logs.length) return '📘 暂无BOSS战报，先发送「修仙讨伐」吧。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        return `#${it.id} ${it.result === 'win' ? '🏆' : '💥'} ${it.bossName} | ${it.rounds}回合 | ${dt}`;
    });
    return [`📘 BOSS战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 详情：修仙伐详 [战报ID]'].join('\n');
}

export function bossDetailText(log: XiuxianBossLog): string {
    const detail = log.battleLog
        .split('\n')
        .map((v: string) => v.trim())
        .filter(Boolean)
        .slice(0, 14);
    return [
        `🔍 BOSS战报 #${log.id}`,
        '━━━━━━━━━━━━',
        `👹 对手：${log.bossName}`,
        `📌 结果：${log.result === 'win' ? '胜利' : '失败'}`,
        `🕒 回合：${log.rounds}`,
        ...detail,
    ].join('\n');
}