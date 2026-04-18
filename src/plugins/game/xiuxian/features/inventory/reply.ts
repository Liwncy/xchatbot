import type {EquipmentSlot, XiuxianItem} from '../../core/types/index.js';

function qualityLabel(raw: string): string {
    if (raw === 'mythic') return '神话(红)';
    if (raw === 'legendary') return '传说(金)';
    if (raw === 'epic') return '史诗';
    if (raw === 'rare') return '稀有';
    if (raw === 'uncommon') return '优秀(绿)';
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

export function bagText(items: XiuxianItem[], page: number, total: number, pageSize: number, filterLabel?: string): string {
    if (!items.length) return '🎒 背包为空，快去探索碰碰运气吧！';
    const lines = items.map(
        (item) =>
            `#${item.id} ${slotLabel(item.itemType)} | ${item.itemName} | ${qualityLabel(item.quality)}${item.refineLevel && item.refineLevel > 0 ? ` | 炼器+${item.refineLevel}` : ''}${item.isLocked > 0 ? ' | 🔒锁定' : ''} | 评分:${item.score}`,
    );
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const title = filterLabel ? `🎒 背包第 ${page}/${pages} 页（共 ${total} 件，筛选：${filterLabel}）` : `🎒 背包第 ${page}/${pages} 页（共 ${total} 件）`;
    return [title, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function equipText(item: XiuxianItem): string {
    return `✅ 装备成功：#${item.id} ${item.itemName}${item.setName ? `【${item.setName}】` : ''}（${slotLabel(item.itemType)}）`;
}

export function unequipText(slot: EquipmentSlot): string {
    return `📤 已卸下${slotLabel(slot)}。`;
}