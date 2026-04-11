import type {EquipmentSlot, XiuxianBattle, XiuxianItem, XiuxianPlayer} from './types.js';

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

