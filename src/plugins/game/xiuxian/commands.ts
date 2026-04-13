import type {EquipmentSlot, XiuxianCommand} from './types.js';

function parsePositiveInt(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
}

function parseSlot(raw: string | undefined): EquipmentSlot | null {
    if (!raw) return null;
    const key = raw.trim();
    if (key === '武器' || key === '神兵' || key.toLowerCase() === 'weapon') return 'weapon';
    if (key === '护甲' || key.toLowerCase() === 'armor') return 'armor';
    if (key === '灵宝' || key.toLowerCase() === 'accessory') return 'accessory';
    if (key === '法器' || key.toLowerCase() === 'sutra') return 'sutra';
    return null;
}

export function parseXiuxianCommand(content: string): XiuxianCommand | null {
    const text = content.trim();
    if (!text) return null;

    const createMatch = text.match(/^修仙创建(?:\s+(.+))?$/);
    if (createMatch) return {type: 'create', name: createMatch[1]?.trim() || undefined};

    if (text === '修仙状态') return {type: 'status'};

    const cultivateMatch = text.match(/^修仙修炼(?:\s+(\d+))?$/);
    if (cultivateMatch) return {type: 'cultivate', times: parsePositiveInt(cultivateMatch[1])};

    if (text === '修仙探索') return {type: 'explore'};

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

    if (text === '修仙挑战') return {type: 'challenge'};

    if (text === '修仙商店') return {type: 'shop'};

    const buyMatch = text.match(/^修仙购买\s+(\d+)$/);
    if (buyMatch) return {type: 'buy', offerId: Number(buyMatch[1])};

    const sellMatch = text.match(/^修仙出售\s+(\d+)$/);
    if (sellMatch) return {type: 'sell', itemId: Number(sellMatch[1])};

    const ledgerMatch = text.match(/^修仙流水(?:\s+(\d+))?$/);
    if (ledgerMatch) return {type: 'ledger', limit: parsePositiveInt(ledgerMatch[1])};

    if (text === '修仙签到') return {type: 'checkin'};

    if (text === '修仙任务') return {type: 'task'};
    if (text === '修仙任务 可领') return {type: 'task', onlyClaimable: true};

    const claimMatch = text.match(/^修仙领奖(?:\s+(.+))?$/);
    if (claimMatch) {
        const arg = claimMatch[1]?.trim();
        if (!arg) return {type: 'claim'};
        if (arg === '全部') return {type: 'claim', claimAll: true};
        return {type: 'claim', taskId: parsePositiveInt(arg)};
    }

    if (text === '修仙成就') return {type: 'achievement'};

    if (text === '修仙讨伐') return {type: 'bossRaid'};

    const bossLogMatch = text.match(/^修仙伐报(?:\s+(\d+))?$/);
    if (bossLogMatch) return {type: 'bossLog', page: parsePositiveInt(bossLogMatch[1])};

    const bossDetailMatch = text.match(/^修仙伐详\s+(\d+)$/);
    if (bossDetailMatch) return {type: 'bossDetail', logId: Number(bossDetailMatch[1])};

    const battleLogMatch = text.match(/^修仙战报(?:\s+(\d+))?$/);
    if (battleLogMatch) return {type: 'battleLog', page: parsePositiveInt(battleLogMatch[1])};

    const battleDetailMatch = text.match(/^修仙战详\s+(\d+)$/);
    if (battleDetailMatch) return {type: 'battleDetail', battleId: Number(battleDetailMatch[1])};

    if (text === '修仙帮助' || text === '修仙指令' || text === '修仙菜单') return {type: 'help'};
    return null;
}

