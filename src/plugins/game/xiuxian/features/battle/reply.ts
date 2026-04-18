import type {XiuxianBattle} from '../../core/types/index.js';
import {realmName} from '../../core/utils/realm.js';
import {formatBeijingTime} from '../../core/utils/time.js';

function parseBattleMeta(raw: string): Record<string, unknown> {
    try {
        const data = JSON.parse(raw) as unknown;
        if (!data || typeof data !== 'object') return {};
        return data as Record<string, unknown>;
    } catch {
        return {};
    }
}

function battleModeLabel(meta: Record<string, unknown>): string {
    if (meta.battleType === 'pvp') {
        return meta.pvpMode === 'force' ? '☠️强斗' : '⚔️切磋';
    }
    return '⚔️挑战';
}

export function challengeResultText(params: {
    enemyName: string;
    win: boolean;
    rounds: number;
    exp: number;
    spiritStone: number;
    logs: string[];
    fortuneLine?: string;
}): string {
    return [
        `${params.win ? '🏆 挑战胜利' : '💥 挑战失败'}：${params.enemyName}`,
        '━━━━━━━━━━━━',
        `🕒 回合数：${params.rounds}`,
        ...(params.win ? [`📈 奖励经验：${params.exp}`, `💎 奖励灵石：${params.spiritStone}`] : []),
        ...params.logs.slice(0, 4),
        ...(params.fortuneLine ? [params.fortuneLine] : []),
    ].join('\n');
}

export function battleLogText(logs: XiuxianBattle[], page: number, pageSize: number): string {
    if (!logs.length) return '📚 暂无战报，先去「修仙挑战」试试身手吧。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        const meta = parseBattleMeta(it.rewardJson);
        return `#${it.id} ${battleModeLabel(meta)} ${it.result === 'win' ? '🏆' : '💥'} ${it.enemyName}（${realmName(it.enemyLevel)}） | ${it.rounds}回合 | ${dt}`;
    });
    return [`📚 战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 查看详情：修仙战详 [战报ID]'].join('\n');
}

export function battleDetailText(battle: XiuxianBattle): string {
    const meta = parseBattleMeta(battle.rewardJson);
    const lines = battle.battleLog
        .split('\n')
        .map((v: string) => v.trim())
        .filter(Boolean)
        .slice(0, 12);
    const rewardLines = [
        typeof meta.exp === 'number' && meta.exp > 0 ? `📈 经验：+${meta.exp}` : null,
        typeof meta.cultivation === 'number' && meta.cultivation > 0 ? `✨ 修为：+${meta.cultivation}` : null,
        typeof meta.spiritStone === 'number' && meta.spiritStone > 0 ? `💎 灵石：+${meta.spiritStone}` : null,
        typeof meta.lootStone === 'number' && meta.lootStone > 0 ? `🏴 掠夺灵石：${meta.lootStone}` : null,
    ].filter((v): v is string => Boolean(v));
    return [
        `🔎 战报 #${battle.id}`,
        '━━━━━━━━━━━━',
        `🏷️ 类型：${battleModeLabel(meta)}`,
        `👾 对手：${battle.enemyName}（${realmName(battle.enemyLevel)}）`,
        `📌 结果：${battle.result === 'win' ? '胜利' : '失败'}`,
        `🕒 回合：${battle.rounds}`,
        ...rewardLines,
        ...lines,
    ].join('\n');
}