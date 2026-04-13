import type {
    EquipmentSlot,
    XiuxianAchievementDef,
    XiuxianBattle,
    XiuxianBossLog,
    XiuxianEconomyLog,
    XiuxianItem,
    XiuxianPlayer,
    XiuxianPlayerAchievement,
    XiuxianPlayerTask,
    XiuxianShopOffer,
    XiuxianTaskDef,
} from './types.js';

function qualityLabel(raw: string): string {
    if (raw === 'epic') return '史诗';
    if (raw === 'rare') return '稀有';
    return '普通';
}

function slotLabel(slot: EquipmentSlot): string {
    switch (slot) {
        case 'weapon':
            return '神兵';
        case 'armor':
            return '护甲';
        case 'accessory':
            return '灵宝';
        case 'sutra':
            return '法器';
        default:
            return slot;
    }
}

export function helpText(): string {
    return [
        '📜 修仙指令菜单',
        '━━━━━━━━━━━━',
        '🌱 修仙创建 [名字]',
        '🧾 修仙状态',
        '🧘 修仙修炼 [次数]',
        '🧭 修仙探索',
        '🎒 修仙背包 [页码] [筛选/排序]',
        '🗡️ 修仙装备 [编号]',
        '🧤 修仙卸装 [武器|护甲|灵宝|法器]',
        '⚔️ 修仙挑战',
        '🏪 修仙商店',
        '🛍️ 修仙购买 [商品ID]',
        '💰 修仙出售 [装备ID]',
        '📒 修仙流水 [条数]',
        '📅 修仙签到',
        '📝 修仙任务 [可领]',
        '🎁 修仙领奖 [任务ID]',
        '🎁 修仙领奖 全部',
        '🏅 修仙成就',
        '👹 修仙讨伐',
        '📘 修仙伐报 [页码]',
        '🔍 修仙伐详 [战报ID]',
        '📚 修仙战报 [页码]',
        '🔎 修仙战详 [战报ID]',
        '',
        '💡 示例：修仙背包 1 神兵 评分降序',
    ].join('\n');
}

export function unknownCommandText(): string {
    return ['❓ 未识别的修仙指令', '💡 发送「修仙帮助」查看完整菜单。'].join('\n');
}

export function createdText(player: XiuxianPlayer): string {
    return [
        `🎉 创建成功：${player.userName}`,
        '━━━━━━━━━━━━',
        `🪪 境界：${player.level} 级`,
        `❤️ 气血：${player.hp}/${player.maxHp}`,
        `🗡️ 攻击：${player.attack}`,
        `🛡️ 防御：${player.defense}`,
        '',
        '💡 试试发送「修仙状态」查看完整面板',
    ].join('\n');
}

export function statusText(
    player: XiuxianPlayer,
    power: {attack: number; defense: number; maxHp: number; dodge: number; crit: number},
    equipped: XiuxianItem[],
    inventoryCount: number,
): string {
    const equippedMap = new Map<EquipmentSlot, XiuxianItem>();
    for (const item of equipped) equippedMap.set(item.itemType, item);
    const eq = (slot: EquipmentSlot): string => {
        const item = equippedMap.get(slot);
        return item ? `${item.itemName}(#${item.id})` : '未装备';
    };
    return [
        `🧾 ${player.userName} 的修仙面板`,
        '━━━━━━━━━━━━',
        `🪪 境界：${player.level} 级`,
        `✨ 修为：${player.cultivation}`,
        `📈 经验：${player.exp}`,
        `❤️ 气血：${player.hp}/${power.maxHp}`,
        `🗡️ 攻击：${power.attack}`,
        `🛡️ 防御：${power.defense}`,
        `💨 闪避：${(power.dodge * 100).toFixed(2)}%`,
        `💥 暴击：${(power.crit * 100).toFixed(2)}%`,
        `💎 灵石：${player.spiritStone}`,
        `🎒 背包：${inventoryCount}/${player.backpackCap}`,
        '━━━━━━━━━━━━',
        `⚔️ 神兵：${eq('weapon')}`,
        `🛡️ 护甲：${eq('armor')}`,
        `💍 灵宝：${eq('accessory')}`,
        `📿 法器：${eq('sutra')}`,
    ].join('\n');
}

export function bagText(items: XiuxianItem[], page: number, total: number, pageSize: number, filterLabel?: string): string {
    if (!items.length) return '🎒 背包为空，快去探索碰碰运气吧！';
    const lines = items.map(
        (item) =>
            `#${item.id} ${slotLabel(item.itemType)} | ${item.itemName} Lv.${item.itemLevel} | ${qualityLabel(item.quality)} | 评分:${item.score}`,
    );
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const title = filterLabel ? `🎒 背包第 ${page}/${pages} 页（共 ${total} 件，筛选：${filterLabel}）` : `🎒 背包第 ${page}/${pages} 页（共 ${total} 件）`;
    return [title, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function battleLogText(logs: XiuxianBattle[], page: number, pageSize: number): string {
    if (!logs.length) return '📚 暂无战报，先去「修仙挑战」试试身手吧。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        return `#${it.id} ${it.result === 'win' ? '🏆' : '💥'} ${it.enemyName} Lv.${it.enemyLevel} | ${it.rounds}回合 | ${dt}`;
    });
    return [`📚 战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 查看详情：修仙战详 [战报ID]'].join('\n');
}

export function battleDetailText(battle: XiuxianBattle): string {
    const lines = battle.battleLog
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 12);
    return [
        `🔎 战报 #${battle.id}`,
        '━━━━━━━━━━━━',
        `👾 对手：${battle.enemyName} Lv.${battle.enemyLevel}`,
        `📌 结果：${battle.result === 'win' ? '胜利' : '失败'}`,
        `🕒 回合：${battle.rounds}`,
        ...lines,
    ].join('\n');
}

export function equipText(item: XiuxianItem): string {
    return `✅ 装备成功：#${item.id} ${item.itemName}（${slotLabel(item.itemType)}）`;
}

export function unequipText(slot: EquipmentSlot): string {
    return `📤 已卸下${slotLabel(slot)}。`;
}

export function cooldownText(actionLabel: string, leftMs: number): string {
    const sec = Math.ceil(leftMs / 1000);
    return `⏳ ${actionLabel}冷却中，请 ${sec}s 后再试。`;
}

export function shopText(offers: XiuxianShopOffer[]): string {
    if (!offers.length) return '🏪 商店暂无商品，请稍后再试。';
    const expiresAt = new Date(offers[0].expiresAt).toLocaleString('zh-CN', {hour12: false});
    const lines = offers.map((offer) => {
        let itemName = '未知法宝';
        let score = 0;
        let quality = '普通';
        try {
            const data = JSON.parse(offer.itemPayloadJson) as Record<string, unknown>;
            itemName = String(data.itemName ?? itemName);
            score = Number(data.score ?? 0);
            quality = qualityLabel(String(data.quality ?? 'common'));
        } catch {
            // 忽略坏数据，继续展示货架。
        }
        return `#${offer.id} ${itemName} | ${quality} | 评分:${score} | 💎${offer.priceSpiritStone}`;
    });
    return ['🏪 天机商店', '━━━━━━━━━━━━', ...lines, `⏱️ 刷新时间：${expiresAt}`, '💡 购买：修仙购买 [商品ID]'].join('\n');
}

export function buyResultText(offer: XiuxianShopOffer, itemName: string, balanceAfter: number): string {
    return ['✅ 购买成功', '━━━━━━━━━━━━', `🎁 获得：${itemName}`, `💸 花费：${offer.priceSpiritStone} 灵石`, `💎 余额：${balanceAfter}`].join('\n');
}

export function sellResultText(itemName: string, gain: number, balanceAfter: number): string {
    return ['✅ 出售成功', '━━━━━━━━━━━━', `📦 出售：${itemName}`, `💰 获得：${gain} 灵石`, `💎 余额：${balanceAfter}`].join('\n');
}

export function economyLogText(logs: XiuxianEconomyLog[], limit: number): string {
    if (!logs.length) return '📒 暂无经济流水。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        const sign = it.deltaSpiritStone >= 0 ? '+' : '';
        const action = it.bizType === 'buy' ? '购买' : it.bizType === 'sell' ? '出售' : it.bizType;
        return `#${it.id} ${action} ${sign}${it.deltaSpiritStone} | 余额:${it.balanceAfter} | ${dt}`;
    });
    return [`📒 最近 ${Math.min(limit, logs.length)} 条流水`, '━━━━━━━━━━━━', ...lines].join('\n');
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
        `🪪 当前境界：${level} 级`,
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

export function bossRaidText(params: {
    bossName: string;
    result: 'win' | 'lose';
    rounds: number;
    reward: {gainedStone: number; gainedExp: number; gainedCultivation: number};
    dropName?: string;
}): string {
    return [
        `${params.result === 'win' ? '🏆 讨伐成功' : '💥 讨伐失利'}：${params.bossName}`,
        '━━━━━━━━━━━━',
        `🕒 回合：${params.rounds}`,
        `💎 灵石 +${params.reward.gainedStone}`,
        `📈 经验 +${params.reward.gainedExp}`,
        `✨ 修为 +${params.reward.gainedCultivation}`,
        ...(params.dropName ? [`🎁 掉落：${params.dropName}`] : []),
        '💡 战报：修仙伐报 / 修仙伐详 [战报ID]',
    ].join('\n');
}

export function bossLogText(logs: XiuxianBossLog[], page: number, pageSize: number): string {
    if (!logs.length) return '📘 暂无BOSS战报，先发送「修仙讨伐」吧。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        return `#${it.id} ${it.result === 'win' ? '🏆' : '💥'} ${it.bossName} | ${it.rounds}回合 | ${dt}`;
    });
    return [`📘 BOSS战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 详情：修仙伐详 [战报ID]'].join('\n');
}

export function bossDetailText(log: XiuxianBossLog): string {
    const detail = log.battleLog
        .split('\n')
        .map((v) => v.trim())
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

