import type {EquipmentSlot, XiuxianCommand, XiuxianItemQuality} from './types.js';

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

function parseQualityKeyword(raw: string): XiuxianItemQuality | null {
    const key = raw.trim().toLowerCase();
    if (key === '普通' || key === '白' || key === 'common') return 'common';
    if (key === '优秀' || key === '精良' || key === '绿' || key === 'uncommon') return 'uncommon';
    if (key === '稀有' || key === '蓝' || key === 'rare') return 'rare';
    if (key === '史诗' || key === '紫' || key === 'epic') return 'epic';
    if (key === '传说' || key === '金' || key === 'legendary') return 'legendary';
    if (key === '神话' || key === '红' || key === 'mythic') return 'mythic';
    return null;
}

function parseSellQualityArg(raw: string): {sellQuality?: XiuxianItemQuality; sellQualityMode?: 'exact' | 'at_least' | 'at_most'} | null {
    const plain = raw.trim().replace(/\s+/g, '');
    if (!plain) return null;
    const withPrefix = plain.startsWith('品质') ? plain.slice(2) : plain;
    if (!withPrefix) return null;

    const atLeast = withPrefix.endsWith('以上') || withPrefix.endsWith('及以上');
    const atMost = withPrefix.endsWith('以下') || withPrefix.endsWith('及以下');
    const qualityRaw = atLeast ? withPrefix.replace(/(及)?以上$/, '') : atMost ? withPrefix.replace(/(及)?以下$/, '') : withPrefix;
    const quality = parseQualityKeyword(qualityRaw);
    if (!quality) return null;
    if (atLeast) return {sellQuality: quality, sellQualityMode: 'at_least'};
    if (atMost) return {sellQuality: quality, sellQualityMode: 'at_most'};
    return {sellQuality: quality, sellQualityMode: 'exact'};
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

    if (text === '修仙挑战') return {type: 'challenge'};

    if (text === '修仙商店') return {type: 'shop'};

    const buyMatch = text.match(/^修仙购买\s+(\d+)$/);
    if (buyMatch) return {type: 'buy', offerId: Number(buyMatch[1])};

    const sellMatch = text.match(/^修仙出售(?:\s+(.+))?$/);
    if (sellMatch) {
        const arg = (sellMatch[1] ?? '').trim();
        if (!arg) return {type: 'sell'};
        if (arg === '全部') return {type: 'sell', sellAll: true};
        const qualityArg = parseSellQualityArg(arg);
        if (qualityArg) return {type: 'sell', ...qualityArg};
        const parts = arg.split(/\s+/).filter(Boolean);
        const ids: number[] = [];
        for (const part of parts) {
            const n = parsePositiveInt(part);
            if (!n) return {type: 'sell'};
            ids.push(n);
        }
        const uniq = Array.from(new Set(ids));
        return {type: 'sell', itemId: uniq[0], itemIds: uniq};
    }

    const auctionCreateMatch = text.match(/^修仙上架(?:\s+(\d+)(?:\s+(\d+)(?:\s+(\d+)(?:\s+(\d+))?)?)?)?$/);
    if (auctionCreateMatch) {
        return {
            type: 'auctionCreate',
            itemId: parsePositiveInt(auctionCreateMatch[1]),
            startPrice: parsePositiveInt(auctionCreateMatch[2]),
            durationMinutes: parsePositiveInt(auctionCreateMatch[3]),
            buyoutPrice: parsePositiveInt(auctionCreateMatch[4]),
        };
    }

    const auctionListMatch = text.match(/^修仙拍卖(?:\s+(\d+))?$/);
    if (auctionListMatch) return {type: 'auctionList', page: parsePositiveInt(auctionListMatch[1])};

    const auctionBidMatch = text.match(/^修仙竞拍(?:\s+(\d+)(?:\s+(\d+))?)?$/);
    if (auctionBidMatch) {
        return {
            type: 'auctionBid',
            auctionId: parsePositiveInt(auctionBidMatch[1]),
            bidPrice: parsePositiveInt(auctionBidMatch[2]),
        };
    }

    const auctionBuyoutMatch = text.match(/^修仙秒拍(?:\s+(\d+))?$/);
    if (auctionBuyoutMatch) return {type: 'auctionBuyout', auctionId: parsePositiveInt(auctionBuyoutMatch[1])};

    const auctionCancelMatch = text.match(/^修仙撤拍(?:\s+(\d+))?$/);
    if (auctionCancelMatch) return {type: 'auctionCancel', auctionId: parsePositiveInt(auctionCancelMatch[1])};

    const auctionSettleMatch = text.match(/^修仙拍结(?:\s+(\d+))?$/);
    if (auctionSettleMatch) return {type: 'auctionSettle', auctionId: parsePositiveInt(auctionSettleMatch[1])};

    const dismantleMatch = text.match(/^修仙分解(?:\s+(.+))?$/);
    if (dismantleMatch) {
        const arg = (dismantleMatch[1] ?? '').trim();
        if (!arg) return {type: 'dismantle'};
        if (arg === '全部') return {type: 'dismantle', dismantleAll: true};
        const qualityArg = parseSellQualityArg(arg);
        if (qualityArg) {
            return {
                type: 'dismantle',
                dismantleQuality: qualityArg.sellQuality,
                dismantleQualityMode: qualityArg.sellQualityMode,
            };
        }
        const parts = arg.split(/\s+/).filter(Boolean);
        const ids: number[] = [];
        for (const part of parts) {
            const n = parsePositiveInt(part);
            if (!n) return {type: 'dismantle'};
            ids.push(n);
        }
        const uniq = Array.from(new Set(ids));
        return {type: 'dismantle', itemId: uniq[0], itemIds: uniq};
    }

    const refineMatch = text.match(/^修仙炼器(?:\s+(\d+)(?:\s+(\d+|无限))?)?$/);
    if (refineMatch) {
        const mode = (refineMatch[2] ?? '').trim();
        return {
            type: 'refine',
            itemId: parsePositiveInt(refineMatch[1]),
            times: mode === '无限' ? undefined : parsePositiveInt(refineMatch[2]),
            infinite: mode === '无限',
        };
    }

    const refineDetailMatch = text.match(/^修仙(?:炼器详情|炼详)(?:\s+(\d+))?$/);
    if (refineDetailMatch) {
        return {
            type: 'refineDetail',
            itemId: parsePositiveInt(refineDetailMatch[1]),
        };
    }

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

    const towerClimbMatch = text.match(/^修仙爬塔(?:\s+(.+))?$/);
    if (towerClimbMatch) {
        const arg = (towerClimbMatch[1] ?? '').trim();
        if (!arg) return {type: 'towerClimb'};
        if (arg === '最大' || arg.toLowerCase() === 'max') {
            // Service layer clamps to XIUXIAN_TOWER.quickClimbMax.
            return {type: 'towerClimb', times: Number.MAX_SAFE_INTEGER};
        }
        return {type: 'towerClimb', times: parsePositiveInt(arg)};
    }

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

    if (text === '修仙卡池') return {type: 'petPool'};

    const petDrawMatch = text.match(/^修仙抽宠(?:\s+(.+))?$/);
    if (petDrawMatch) {
        const arg = (petDrawMatch[1] ?? '').trim();
        if (!arg) return {type: 'petDraw', times: 1};
        if (arg === '十连') return {type: 'petDraw', times: 10};
        const n = parsePositiveInt(arg);
        return {type: 'petDraw', times: n};
    }

    if (text === '修仙保底') return {type: 'petPity'};

    const petStatusMatch = text.match(/^修仙宠物(?:\s+(\d+))?$/);
    if (petStatusMatch) return {type: 'petStatus', petId: parsePositiveInt(petStatusMatch[1])};

    const petBagMatch = text.match(/^修仙宠包(?:\s+(\d+))?$/);
    if (petBagMatch) return {type: 'petBag', page: parsePositiveInt(petBagMatch[1])};

    const petFeedMatch = text.match(/^修仙喂宠(?:\s+(\d+)(?:\s+(\d+))?)?$/);
    if (petFeedMatch) {
        return {
            type: 'petFeed',
            itemId: parsePositiveInt(petFeedMatch[1]),
            count: parsePositiveInt(petFeedMatch[2]),
        };
    }

    const petDeployMatch = text.match(/^修仙出宠(?:\s+(\d+))?$/);
    if (petDeployMatch) return {type: 'petDeploy', petId: parsePositiveInt(petDeployMatch[1])};

    if (text === '修仙休宠') return {type: 'petRest'};

    if (text === '修仙奇遇') return {type: 'npcEncounter'};

    const encounterLogMatch = text.match(/^修仙奇录(?:\s+(\d+))?$/);
    if (encounterLogMatch) return {type: 'npcEncounterLog', page: parsePositiveInt(encounterLogMatch[1])};

    const bondMatch = text.match(/^修仙结缘(?:\s*(.+))?$/);
    if (bondMatch) return {type: 'bond', targetUserId: bondMatch[1]?.trim() || undefined};

    if (text === '修仙允缘') return {type: 'bondAccept'};

    if (text === '修仙拒缘') return {type: 'bondReject'};

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

