import type {EquipmentSlot, XiuxianItem, XiuxianPlayer} from './types.js';

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
        '🧘 修炼 [次数]',
        '🧭 探索',
        '🎒 背包 [页码]',
        '🗡️ 装备 [编号]',
        '🧤 卸下 [武器|护甲|灵宝|法器]',
        '⚔️ 挑战',
    ].join('\n');
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

export function statusText(player: XiuxianPlayer, power: {attack: number; defense: number; maxHp: number}): string {
    return [
        `🧾 ${player.userName} 的修仙面板`,
        '━━━━━━━━━━━━',
        `🪪 境界：${player.level} 级`,
        `✨ 修为：${player.cultivation}`,
        `📈 经验：${player.exp}`,
        `❤️ 气血：${power.maxHp}`,
        `🗡️ 攻击：${power.attack}`,
        `🛡️ 防御：${power.defense}`,
        `💎 灵石：${player.spiritStone}`,
    ].join('\n');
}

export function bagText(items: XiuxianItem[], page: number, total: number, pageSize: number): string {
    if (!items.length) return '🎒 背包为空，快去探索碰碰运气吧！';
    const lines = items.map((item) => `#${item.id} ${slotLabel(item.itemType)} | ${item.itemName} Lv.${item.itemLevel} | ${item.quality}`);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return [`🎒 背包第 ${page}/${pages} 页（共 ${total} 件）`, '━━━━━━━━━━━━', ...lines].join('\n');
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

