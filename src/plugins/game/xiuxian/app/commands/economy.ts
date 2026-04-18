import type {XiuxianCommand} from '../../core/types/index.js';
import {parsePositiveInt, parseSellQualityArg} from './common.js';

export function parseEconomyCommand(text: string): XiuxianCommand | null {
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

    return null;
}