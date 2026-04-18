import type {XiuxianAchievementDef, XiuxianItem, XiuxianItemQuality, XiuxianPlayerAchievement, XiuxianPlayerTask, XiuxianTaskDef} from '../../core/types/index.js';
import {XIUXIAN_TERMS} from '../../core/constants/index.js';
import {formatRealm} from '../../core/utils/realm.js';

function qualityLabel(quality: XiuxianItemQuality): string {
    if (quality === 'mythic') return '神话(红)';
    if (quality === 'legendary') return '传说(金)';
    if (quality === 'epic') return '史诗(紫)';
    if (quality === 'rare') return '稀有(蓝)';
    if (quality === 'uncommon') return '优秀(绿)';
    return '普通(白)';
}

export function cultivateText(params: {
    times: number;
    gainedCultivation: number;
    gainedExp: number;
    gainedStone: number;
    petBonus: number;
    level: number;
    fortuneLine?: string;
}): string {
    return [
        `🧘 修炼完成 x${params.times}`,
        '━━━━━━━━━━━━',
        `✨ 修为 +${params.gainedCultivation}`,
        `📈 经验 +${params.gainedExp}`,
        `💎 灵石 +${params.gainedStone}${params.petBonus > 0 ? `（灵宠加成 +${params.petBonus}）` : ''}`,
        `🪪 ${XIUXIAN_TERMS.realm.currentLabel}：${formatRealm(params.level)}`,
        ...(params.fortuneLine ? [params.fortuneLine] : []),
    ].join('\n');
}

export function exploreStoneText(params: {
    stone: number;
    dropHint: string;
    fortuneLine?: string;
    backpackFull?: boolean;
}): string {
    return `${params.backpackFull ? '🎒 背包已满，本次探索改为获得灵石' : '🧭 本次探索没有发现装备，获得灵石'} ${params.stone}。\n${params.dropHint}${params.fortuneLine ? `\n${params.fortuneLine}` : ''}`;
}

export function exploreLootText(params: {
    loot: Pick<XiuxianItem, 'itemName' | 'quality' | 'itemType' | 'attack' | 'defense' | 'hp'>;
    dropHint: string;
    fortuneLine?: string;
}): string {
    return [
        `🎁 探索成功：获得 ${params.loot.itemName}（${qualityLabel(params.loot.quality)}）`,
        '━━━━━━━━━━━━',
        `🧩 类型：${params.loot.itemType}`,
        `🗡️ 攻击 +${params.loot.attack}  🛡️ 防御 +${params.loot.defense}  ❤️ 气血 +${params.loot.hp}`,
        `🏷️ 品质：${qualityLabel(params.loot.quality)}`,
        params.dropHint,
        ...(params.fortuneLine ? [params.fortuneLine] : []),
    ].join('\n');
}

export function checkinText(
    reward: {spiritStone: number; exp: number; cultivation: number},
    level: number,
    spiritStone: number,
): string {
    return [
        '📅 今日签到成功',
        '━━━━━━━━━━━━',
        `💎 灵石 +${reward.spiritStone}`,
        `📈 经验 +${reward.exp}`,
        `✨ 修为 +${reward.cultivation}`,
        `🪪 ${XIUXIAN_TERMS.realm.currentLabel}：${formatRealm(level)}`,
        `💼 当前灵石：${spiritStone}`,
    ].join('\n');
}

export function taskText(defs: XiuxianTaskDef[], states: XiuxianPlayerTask[], dayKey: string, onlyClaimable?: boolean): string {
    if (!defs.length) return '📝 暂无任务配置。';
    const stateMap = new Map<number, XiuxianPlayerTask>();
    for (const row of states) stateMap.set(row.taskId, row);
    const lines = defs.map((def) => {
        const st = stateMap.get(def.id);
        const progress = st?.progressValue ?? 0;
        const target = st?.targetValue ?? def.targetValue;
        const flag = st?.status === 'claimed' ? '✅ 已领' : st?.status === 'claimable' ? '🎁 可领' : '⏳ 进行中';
        return `#${def.id} ${def.title} | ${progress}/${target} | ${flag}`;
    });
    const claimableCount = states.filter((v) => v.status === 'claimable').length;
    const modeLabel = onlyClaimable ? '（仅可领）' : '';
    return [
        `📝 每日任务${modeLabel}（${dayKey}）`,
        '━━━━━━━━━━━━',
        ...lines,
        `🎁 当前可领：${claimableCount} 项`,
        '💡 领取：修仙领奖 [任务ID] / 修仙领奖 全部',
    ].join('\n');
}

export function claimTaskText(
    taskTitle: string,
    reward: {spiritStone: number; exp: number; cultivation: number},
    balanceAfter: number,
): string {
    return [
        `🎁 任务奖励已领取：${taskTitle}`,
        '━━━━━━━━━━━━',
        `💎 灵石 +${reward.spiritStone}`,
        `📈 经验 +${reward.exp}`,
        `✨ 修为 +${reward.cultivation}`,
        `💼 当前灵石：${balanceAfter}`,
    ].join('\n');
}

export function claimTaskBatchText(
    taskTitles: string[],
    reward: {spiritStone: number; exp: number; cultivation: number},
    balanceAfter: number,
): string {
    return [
        `🎁 已领取 ${taskTitles.length} 项任务奖励`,
        '━━━━━━━━━━━━',
        `🧾 任务：${taskTitles.join('、')}`,
        `💎 灵石 +${reward.spiritStone}`,
        `📈 经验 +${reward.exp}`,
        `✨ 修为 +${reward.cultivation}`,
        `💼 当前灵石：${balanceAfter}`,
    ].join('\n');
}

export function achievementText(
    defs: XiuxianAchievementDef[],
    states: XiuxianPlayerAchievement[],
    justClaimedTitles: string[],
): string {
    if (!defs.length) return '🏅 暂无成就配置。';
    const stateMap = new Map<number, XiuxianPlayerAchievement>();
    for (const row of states) stateMap.set(row.achievementId, row);
    const lines = defs.map((def) => {
        const st = stateMap.get(def.id);
        const progress = st?.progressValue ?? 0;
        const target = st?.targetValue ?? def.targetValue;
        const flag = st?.status === 'claimed' ? '✅ 已达成' : st?.status === 'claimable' ? '🎉 可领取' : '⏳ 未完成';
        return `${def.title} | ${progress}/${target} | ${flag}`;
    });
    const auto = justClaimedTitles.length ? [`🎊 本次自动领取：${justClaimedTitles.join('、')}`, '━━━━━━━━━━━━'] : [];
    const claimableCount = states.filter((v) => v.status === 'claimable').length;
    const claimedCount = states.filter((v) => v.status === 'claimed').length;
    return ['🏅 成就进度', ...auto, ...lines, '━━━━━━━━━━━━', `🎯 可领取：${claimableCount}  |  ✅ 已完成：${claimedCount}`].join('\n');
}