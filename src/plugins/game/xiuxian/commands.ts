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

function parseTowerRankArgs(raw: string | undefined): {limit?: number; selfOnly?: boolean; scope?: 'all' | 'weekly'} {
    if (!raw) return {};
    const parts = raw
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const out: {limit?: number; selfOnly?: boolean; scope?: 'all' | 'weekly'} = {};
    for (const part of parts) {
        const lower = part.toLowerCase();
        if (part === '我' || lower === 'me') {
            out.selfOnly = true;
            continue;
        }
        if (part === '周榜' || part === '周' || lower === 'weekly') {
            out.scope = 'weekly';
            continue;
        }
        if (part === '总榜' || part === '总' || lower === 'all') {
            out.scope = 'all';
            continue;
        }
        const n = parsePositiveInt(part);
        if (n) out.limit = n;
    }
    return out;
}

function parseTowerSeasonRankArgs(raw: string | undefined): {limit?: number; selfOnly?: boolean; seasonKey?: string} {
    if (!raw) return {};
    const parts = raw
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const out: {limit?: number; selfOnly?: boolean; seasonKey?: string} = {};
    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const lower = part.toLowerCase();
        if (part === '我' || lower === 'me') {
            out.selfOnly = true;
            continue;
        }
        if (part === '上季' || part === '上个赛季') {
            out.seasonKey = '__prev__';
            continue;
        }
        if (part === '历史') {
            const key = parts[i + 1];
            if (key) {
                out.seasonKey = key.toUpperCase();
                i += 1;
            }
            continue;
        }
        if (/^\d{4}-W\d{2}$/i.test(part)) {
            out.seasonKey = part.toUpperCase();
            continue;
        }
        const n = parsePositiveInt(part);
        if (n) out.limit = n;
    }
    return out;
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

    if (text === '修仙伐况') return {type: 'bossStatus'};

    const bossRankMatch = text.match(/^修仙伐榜(?:\s+(.+))?$/);
    if (bossRankMatch) {
        const arg = bossRankMatch[1]?.trim();
        if (!arg) return {type: 'bossRank'};
        if (arg === '我' || arg.toLowerCase() === 'me') return {type: 'bossRank', selfOnly: true};
        return {type: 'bossRank', limit: parsePositiveInt(arg)};
    }

    const bossLogMatch = text.match(/^修仙伐报(?:\s+(\d+))?$/);
    if (bossLogMatch) return {type: 'bossLog', page: parsePositiveInt(bossLogMatch[1])};

    const bossDetailMatch = text.match(/^修仙伐详\s+(\d+)$/);
    if (bossDetailMatch) return {type: 'bossDetail', logId: Number(bossDetailMatch[1])};

    if (text === '修仙爬塔') return {type: 'towerClimb'};

    if (text === '修仙塔况') return {type: 'towerStatus'};

    const towerRankMatch = text.match(/^修仙塔榜(?:\s+(.+))?$/);
    if (towerRankMatch) {
        const arg = towerRankMatch[1]?.trim();
        const parsed = parseTowerRankArgs(arg);
        return {type: 'towerRank', ...parsed};
    }

    const towerLogMatch = text.match(/^修仙塔报(?:\s+(\d+))?$/);
    if (towerLogMatch) return {type: 'towerLog', page: parsePositiveInt(towerLogMatch[1])};

    const towerDetailMatch = text.match(/^修仙塔详\s+(\d+)$/);
    if (towerDetailMatch) return {type: 'towerDetail', logId: Number(towerDetailMatch[1])};

    if (text === '修仙季键') return {type: 'towerSeasonKey'};

    if (text === '修仙季况') return {type: 'towerSeasonStatus'};

    const towerSeasonRankMatch = text.match(/^修仙季榜(?:\s+(.+))?$/);
    if (towerSeasonRankMatch) {
        const arg = towerSeasonRankMatch[1]?.trim();
        const parsed = parseTowerSeasonRankArgs(arg);
        return {type: 'towerSeasonRank', ...parsed};
    }

    if (text === '修仙季奖') return {type: 'towerSeasonReward'};

    if (text === '修仙季领') return {type: 'towerSeasonClaim'};

    if (text === '修仙领宠') return {type: 'petAdopt'};

    if (text === '修仙宠物') return {type: 'petStatus'};

    if (text === '修仙喂宠') return {type: 'petFeed'};

    if (text === '修仙出宠') return {type: 'petDeploy'};

    if (text === '修仙休宠') return {type: 'petRest'};

    if (text === '修仙奇遇') return {type: 'npcEncounter'};

    const encounterLogMatch = text.match(/^修仙奇录(?:\s+(\d+))?$/);
    if (encounterLogMatch) return {type: 'npcEncounterLog', page: parsePositiveInt(encounterLogMatch[1])};

    const bondMatch = text.match(/^修仙结缘(?:\s*(.+))?$/);
    if (bondMatch) return {type: 'bond', targetUserId: bondMatch[1]?.trim() || undefined};

    if (text === '修仙解缘') return {type: 'bondBreak'};

    if (text === '修仙同游') return {type: 'bondTravel'};

    if (text === '修仙情缘') return {type: 'bondStatus'};

    const bondLogMatch = text.match(/^修仙情录(?:\s+(\d+))?$/);
    if (bondLogMatch) return {type: 'bondLog', page: parsePositiveInt(bondLogMatch[1])};

    const battleLogMatch = text.match(/^修仙战报(?:\s+(\d+))?$/);
    if (battleLogMatch) return {type: 'battleLog', page: parsePositiveInt(battleLogMatch[1])};

    const battleDetailMatch = text.match(/^修仙战详\s+(\d+)$/);
    if (battleDetailMatch) return {type: 'battleDetail', battleId: Number(battleDetailMatch[1])};

    const helpMatch = text.match(/^修仙帮助(?:\s+(.+))?$/);
    if (helpMatch) return {type: 'help', topic: helpMatch[1]?.trim() || undefined};
    if (text === '修仙指令' || text === '修仙菜单') return {type: 'help'};
    return null;
}

