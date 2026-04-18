import type {XiuxianCommand} from '../../core/types/index.js';
import {parsePositiveInt, parseSlot} from './common.js';

export function parseInventoryCommand(text: string): XiuxianCommand | null {
    const bagMatch = text.match(/^修仙背包(?:\s+(.+))?$/);
    if (bagMatch) {
        const arg = bagMatch[1]?.trim();
        if (!arg) return {type: 'bag'};
        const parts = arg.split(/\s+/).filter(Boolean);
        const firstNum = parsePositiveInt(parts[0]);
        if (firstNum) return {type: 'bag', page: firstNum, filter: parts.slice(1).join(' ')};
        return {type: 'bag', filter: parts.join(' ')};
    }

    const equipMatch = text.match(/^修仙装备\s+(\d+)$/);
    if (equipMatch) return {type: 'equip', itemId: Number(equipMatch[1])};

    const unequipMatch = text.match(/^修仙卸装\s+(.+)$/);
    if (unequipMatch) {
        const slot = parseSlot(unequipMatch[1]);
        if (slot) return {type: 'unequip', slot};
    }

    const lockMatch = text.match(/^修仙上锁(?:\s+(.+))?$/);
    if (lockMatch) {
        const arg = (lockMatch[1] ?? '').trim();
        if (!arg) return {type: 'lock'};
        const parts = arg.split(/\s+/).filter(Boolean);
        const ids: number[] = [];
        for (const part of parts) {
            const n = parsePositiveInt(part);
            if (!n) return {type: 'lock'};
            ids.push(n);
        }
        const uniq = Array.from(new Set(ids));
        return {type: 'lock', itemId: uniq[0], itemIds: uniq};
    }

    const unlockMatch = text.match(/^修仙解锁(?:\s+(.+))?$/);
    if (unlockMatch) {
        const arg = (unlockMatch[1] ?? '').trim();
        if (!arg) return {type: 'unlock'};
        const parts = arg.split(/\s+/).filter(Boolean);
        const ids: number[] = [];
        for (const part of parts) {
            const n = parsePositiveInt(part);
            if (!n) return {type: 'unlock'};
            ids.push(n);
        }
        const uniq = Array.from(new Set(ids));
        return {type: 'unlock', itemId: uniq[0], itemIds: uniq};
    }

    return null;
}