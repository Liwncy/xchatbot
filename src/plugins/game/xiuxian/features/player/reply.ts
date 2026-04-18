import type {EquipmentSlot, XiuxianItem, XiuxianPlayer} from '../../core/types/index.js';
import {XIUXIAN_TERMS} from '../../core/constants/index.js';
import {formatRealm} from '../../core/utils/realm.js';

export function createdText(player: XiuxianPlayer): string {
    return [
        `🎉 创建成功：${player.userName}`,
        '━━━━━━━━━━━━',
        `🪪 ${XIUXIAN_TERMS.realm.label}：${formatRealm(player.level)}`,
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
    setBonusLines?: string[],
): string {
    const equippedMap = new Map<EquipmentSlot, XiuxianItem>();
    for (const item of equipped) equippedMap.set(item.itemType, item);
    const eq = (slot: EquipmentSlot): string => {
        const item = equippedMap.get(slot);
        if (!item) return '未装备';
        const setLabel = item.setName ? `【${item.setName}】` : '';
        return `${item.itemName}${setLabel}(#${item.id})`;
    };
    return [
        `🧾 ${player.userName} 的修仙面板`,
        '━━━━━━━━━━━━',
        `🪪 ${XIUXIAN_TERMS.realm.label}：${formatRealm(player.level)}`,
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
        ...(setBonusLines && setBonusLines.length ? ['━━━━━━━━━━━━', '🧩 套装效果：', ...setBonusLines] : []),
    ].join('\n');
}