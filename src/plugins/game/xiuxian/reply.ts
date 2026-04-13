import type {
    EquipmentSlot,
    XiuxianAchievementDef,
    XiuxianBattle,
    XiuxianBossLog,
    XiuxianWorldBossContribution,
    XiuxianWorldBossState,
    XiuxianEconomyLog,
    XiuxianItem,
    XiuxianPlayer,
    XiuxianPlayerAchievement,
    XiuxianPlayerTask,
    XiuxianShopOffer,
    XiuxianTaskDef,
    XiuxianTowerRankRow,
    XiuxianTowerSeasonRankRow,
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

export function helpText(topic?: string): string {
    const map: Record<string, string[]> = {
        基础: ['🌱 修仙创建 [名字]', '🧾 修仙状态', '🧘 修仙修炼 [次数]', '🧭 修仙探索', '🎒 修仙背包 [页码] [筛选/排序]', '🗡️ 修仙装备 [编号]', '🧤 修仙卸装 [武器|护甲|灵宝|法器]'],
        经济: ['🏪 修仙商店', '🛍️ 修仙购买 [商品ID]', '💰 修仙出售 [装备ID]', '📒 修仙流水 [条数]'],
        成长: ['📅 修仙签到', '📝 修仙任务 [可领]', '🎁 修仙领奖 [任务ID]', '🎁 修仙领奖 全部', '🏅 修仙成就', '🎲 修仙奇遇', '📜 修仙奇录 [页码]', '💞 修仙结缘 [对方wxid]', '💔 修仙解缘', '🌸 修仙同游', '💗 修仙情缘', '📖 修仙情录 [页码]'],
        讨伐: ['👹 修仙讨伐', '📢 修仙伐况', '🏅 修仙伐榜 [条数|我]', '📘 修仙伐报 [页码]', '🔍 修仙伐详 [战报ID]'],
        爬塔: ['🗼 修仙爬塔', '🧭 修仙塔况', '🏔️ 修仙塔榜 [周榜|总榜] [条数|我]', '🧩 修仙季键', '🕰️ 修仙季况', '🌄 修仙季榜 [上季|历史 2026-W15|条数|我]', '🎖️ 修仙季奖', '🎁 修仙季领', '📜 修仙塔报 [页码]', '🔎 修仙塔详 [战报ID]'],
        灵宠: ['🐾 修仙领宠', '🐶 修仙宠物', '🍼 修仙喂宠', '⚔️ 修仙出宠', '🛌 修仙休宠'],
        战报: ['📚 修仙战报 [页码]', '🔎 修仙战详 [战报ID]'],
    };

    const aliasMap: Record<string, string> = {
        // 基础
        新手: '基础',
        入门: '基础',
        面板: '基础',
        背包: '基础',
        // 经济
        商店: '经济',
        购买: '经济',
        出售: '经济',
        流水: '经济',
        // 成长
        签到: '成长',
        任务: '成长',
        成就: '成长',
        领奖: '成长',
        // 讨伐
        boss: '讨伐',
        BOSS: '讨伐',
        讨伐: '讨伐',
        伐榜: '讨伐',
        // 爬塔
        爬塔: '爬塔',
        塔: '爬塔',
        赛季: '爬塔',
        季榜: '爬塔',
        塔榜: '爬塔',
        // 灵宠
        灵宠: '灵宠',
        宠物: '灵宠',
        喂宠: '灵宠',
        出宠: '灵宠',
        // 战报
        战报: '战报',
    };

    const categoryOrder = ['基础', '经济', '成长', '讨伐', '爬塔', '灵宠', '战报'];

    const renderCmdLines = (lines: string[]): string[] => lines.map((line, idx) => `${String(idx + 1).padStart(2, '0')}. ${line}`);
    const renderSection = (name: string): string[] => [`【${name}】`, ...renderCmdLines(map[name] ?? []), ''];

    const rawKey = topic?.trim();
    const key = rawKey ? aliasMap[rawKey] ?? rawKey : '全部';

    if (key === '全部') {
        const blocks = categoryOrder.flatMap((name) => renderSection(name));
        return ['📜 修仙帮助（全部）', '━━━━━━━━━━━━', ...blocks, '💡 指令格式统一为「修仙 + 双字动作」'].join('\n');
    }

    const lines = map[key];
    if (!lines) {
        return ['❓ 未识别的帮助分类', '💡 可用分类：基础/经济/成长/讨伐/爬塔/灵宠/战报/全部', '💡 常见别名：商店→经济，赛季/塔榜→爬塔，宠物→灵宠'].join('\n');
    }
    return [
        `📜 修仙帮助（${key}）`,
        '━━━━━━━━━━━━',
        ...renderCmdLines(lines),
        '━━━━━━━━━━━━',
        '💡 返回总览：修仙帮助',
        '💡 查看全部：修仙帮助 全部',
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
        `🪪 等级：Lv.${state.bossLevel}`,
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
            ? `☠️ 尾刀：${extra.killerName} | 🕒 击杀时间：${new Date(extra.defeatedAt).toLocaleString('zh-CN', {hour12: false})} | ⌛ 重生：${extra.respawnLeftSec ?? 0}s`
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

export function towerClimbText(params: {
    floor: number;
    result: 'win' | 'lose';
    rounds: number;
    reward: {spiritStone: number; exp: number; cultivation: number};
    highestFloor: number;
}): string {
    return [
        `${params.result === 'win' ? '🏆' : '💥'} 爬塔${params.result === 'win' ? '成功' : '失败'}：第 ${params.floor} 层`,
        '━━━━━━━━━━━━',
        `🕒 回合：${params.rounds}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
        `🗼 当前最高层：${params.highestFloor}`,
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
        `📅 结算时间：${new Date(params.settleAt).toLocaleString('zh-CN', {hour12: false})}`,
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
    const lines = tiers.map((v, i) =>
        `${i + 1}. 前${v.maxRank}名：💎${v.spiritStone}  📈${v.exp}  ✨${v.cultivation}`,
    );
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

export function petAdoptText(pet: {petName: string; petType: string; level: number}): string {
    return [
        `🐾 领宠成功：${pet.petName}（${pet.petType}）`,
        '━━━━━━━━━━━━',
        `📶 灵宠等级：${pet.level}`,
        '💡 发送「修仙宠物」查看灵宠状态',
    ].join('\n');
}

export function petStatusText(
    pet: {petName: string; petType: string; level: number; affection: number; feedCount: number; inBattle?: number},
    combat?: {attack: number; defense: number; hp: number},
): string {
    const bonusStone = Math.floor(pet.level / 5) + (pet.affection >= 50 ? 1 : 0);
    return [
        `🐶 灵宠面板：${pet.petName}`,
        '━━━━━━━━━━━━',
        `🧬 类型：${pet.petType}`,
        `📶 等级：${pet.level}`,
        `💖 亲密：${pet.affection}/100`,
        `🍼 喂养次数：${pet.feedCount}`,
        `🚩 当前状态：${pet.inBattle === 0 ? '休战' : '出战'}`,
        `✨ 修炼加成：灵石 +${bonusStone}/次`,
        ...(combat ? [`⚔️ 战斗加成：攻+${combat.attack} 防+${combat.defense} 血+${combat.hp}`] : []),
        '💡 发送「修仙喂宠」可提升灵宠等级；发送「修仙出宠/修仙休宠」切换战斗状态',
    ].join('\n');
}

export function petBattleStateText(petName: string, inBattle: boolean): string {
    return inBattle ? `⚔️ ${petName} 已切换为出战状态。` : `🛌 ${petName} 已切换为休战状态。`;
}

export function petFeedText(
    pet: {petName: string; level: number; affection: number},
    cost: number,
    balanceAfter: number,
    milestoneLines?: string[],
): string {
    return [
        `🍼 喂宠成功：${pet.petName}`,
        '━━━━━━━━━━━━',
        `💎 消耗灵石：${cost}`,
        `📶 当前等级：${pet.level}`,
        `💖 当前亲密：${pet.affection}/100`,
        `💼 当前灵石：${balanceAfter}`,
        ...(milestoneLines?.length ? ['━━━━━━━━━━━━', ...milestoneLines] : []),
    ].join('\n');
}

export function npcEncounterText(params: {
    title: string;
    tier: string;
    reward: {spiritStone: number; exp: number; cultivation: number};
}): string {
    const tierLabel = params.tier === 'legend' ? '传说' : params.tier === 'epic' ? '稀有' : params.tier === 'rare' ? '奇异' : '普通';
    return [
        `🎲 今日奇遇：${params.title}`,
        '━━━━━━━━━━━━',
        `🏷️ 奇遇品质：${tierLabel}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
    ].join('\n');
}

export function npcEncounterLogText(
    logs: Array<{id: number; dayKey: string; eventTitle: string; eventTier: string; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📜 暂无奇遇记录，先发送「修仙奇遇」吧。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        return `#${it.id} ${it.eventTitle}（${it.eventTier}） | ${it.dayKey} | ${dt}`;
    });
    return [`📜 奇遇记录第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function bondRequestText(targetUserId: string): string {
    return `💌 你已向 ${targetUserId} 发起结缘请求，对方输入「修仙结缘 你的wxid」即可确认。`;
}

export function bondActivatedText(targetName: string): string {
    return `💞 结缘成功！你与 ${targetName} 已缔结情缘。`;
}

export function bondBreakText(targetName: string): string {
    return `💔 你与 ${targetName} 已解除情缘。愿各自安好，仙路再会。`;
}

export function bondStatusText(params: {partnerName: string; status: 'pending' | 'active' | 'ended'; intimacy: number; level: number; canTravel: boolean}): string {
    return [
        `💗 情缘对象：${params.partnerName}`,
        '━━━━━━━━━━━━',
        `📌 关系状态：${params.status === 'active' ? '已结缘' : params.status === 'pending' ? '待确认' : '已解除'}`,
        `💞 亲密度：${params.intimacy}`,
        `💠 情缘等级：${params.level}`,
        `🌸 今日同游：${params.canTravel ? '可进行' : '已完成'}`,
    ].join('\n');
}

export function bondTravelText(params: {partnerName: string; gainedIntimacy: number; level: number; reward: {spiritStone: number; exp: number; cultivation: number}}): string {
    return [
        `🌸 今日与 ${params.partnerName} 同游完成`,
        '━━━━━━━━━━━━',
        `💞 亲密度 +${params.gainedIntimacy}`,
        `💠 当前情缘等级：${params.level}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
    ].join('\n');
}

export function bondLogText(
    logs: Array<{id: number; action: string; deltaIntimacy: number; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📖 暂无情缘记录，先发送「修仙结缘」吧。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        return `#${it.id} ${it.action} | 亲密+${it.deltaIntimacy} | ${dt}`;
    });
    return [`📖 情录第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function towerLogText(
    logs: Array<{id: number; floor: number; result: 'win' | 'lose'; rounds: number; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📜 暂无爬塔战报，先发送「修仙爬塔」挑战吧。';
    const lines = logs.map((it) => {
        const dt = new Date(it.createdAt).toLocaleString('zh-CN', {hour12: false});
        return `#${it.id} ${it.result === 'win' ? '🏆' : '💥'} 第${it.floor}层 | ${it.rounds}回合 | ${dt}`;
    });
    return [`📜 塔战报第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 详情：修仙塔详 [战报ID]'].join('\n');
}

export function towerDetailText(log: {id: number; floor: number; result: 'win' | 'lose'; rounds: number; battleLog: string}): string {
    const detail = log.battleLog
        .split('\n')
        .map((v) => v.trim())
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

