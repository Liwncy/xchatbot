import {XIUXIAN_AUCTION} from '../../core/constants/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianAuction, XiuxianItem, XiuxianItemQuality} from '../../core/types/index.js';
import {auctionSettleNoBidText, auctionSettleText} from './reply.js';

export function parseAuctionItemPayload(itemPayloadJson: string): Omit<XiuxianItem, 'id' | 'playerId' | 'createdAt'> | null {
    try {
        const data = JSON.parse(itemPayloadJson) as Record<string, unknown>;
        return {
            itemType: String(data.itemType) as XiuxianItem['itemType'],
            itemName: String(data.itemName),
            itemLevel: Math.max(1, Number(data.itemLevel) || 1),
            quality: String(data.quality) as XiuxianItemQuality,
            attack: Number(data.attack),
            defense: Number(data.defense),
            hp: Number(data.hp),
            dodge: Number(data.dodge),
            crit: Number(data.crit),
            score: Number(data.score),
            setKey: data.setKey == null ? undefined : String(data.setKey),
            setName: data.setName == null ? undefined : String(data.setName),
            isLocked: Number(data.isLocked ?? 0),
        };
    } catch {
        return null;
    }
}

export function parseAuctionBuyoutPrice(itemPayloadJson: string): number | null {
    try {
        const data = JSON.parse(itemPayloadJson) as Record<string, unknown>;
        const buyoutPrice = Number(data.buyoutPrice ?? 0);
        if (!Number.isFinite(buyoutPrice) || buyoutPrice <= 0) return null;
        return Math.floor(buyoutPrice);
    } catch {
        return null;
    }
}

export async function settleSingleAuction(repo: XiuxianRepository, auction: XiuxianAuction, now: number): Promise<{ok: boolean; text: string}> {
    const item = parseAuctionItemPayload(auction.itemPayloadJson);
    const itemName = item?.itemName ?? '未知装备';

    if (!auction.currentBidderId) {
        const locked = await repo.settleAuctionByVersion(auction.id, auction.version, 'expired', now);
        if (!locked) return {ok: false, text: '⚠️ 拍卖状态已更新，请刷新后重试。'};
        if (item) {
            await repo.addItem(auction.sellerId, item, now);
        }
        await repo.addAuctionSettlement({
            auctionId: auction.id,
            sellerId: auction.sellerId,
            winnerId: null,
            finalPrice: 0,
            feeAmount: 0,
            sellerReceive: 0,
            result: 'expired',
            detailJson: JSON.stringify({reason: 'no_bid'}),
            now,
        });
        return {ok: true, text: auctionSettleNoBidText(auction.id, itemName)};
    }

    const paid = await repo.spendSpiritStone(auction.currentBidderId, auction.currentPrice, now);
    if (!paid) {
        const expired = await repo.settleAuctionByVersion(auction.id, auction.version, 'expired', now);
        if (!expired) return {ok: false, text: '⚠️ 拍卖状态已更新，请刷新后重试。'};
        if (item) {
            await repo.addItem(auction.sellerId, item, now);
        }
        await repo.addAuctionSettlement({
            auctionId: auction.id,
            sellerId: auction.sellerId,
            winnerId: auction.currentBidderId,
            finalPrice: auction.currentPrice,
            feeAmount: 0,
            sellerReceive: 0,
            result: 'expired',
            detailJson: JSON.stringify({reason: 'winner_insufficient_stone'}),
            now,
        });
        return {ok: true, text: `⚠️ 拍卖 #${auction.id} 赢家灵石不足，已按流拍处理并返还拍品。`};
    }

    const settled = await repo.settleAuctionByVersion(auction.id, auction.version, 'settled', now);
    if (!settled) {
        await repo.gainSpiritStone(auction.currentBidderId, auction.currentPrice, now);
        return {ok: false, text: '⚠️ 拍卖状态已更新，请刷新后重试。'};
    }

    const feeAmount = Math.floor((auction.currentPrice * auction.feeRateBp) / 10_000);
    const sellerReceive = Math.max(0, auction.currentPrice - feeAmount);
    if (sellerReceive > 0) {
        await repo.gainSpiritStone(auction.sellerId, sellerReceive, now);
    }
    if (item) {
        await repo.addItem(auction.currentBidderId, item, now);
    }

    const winner = await repo.findPlayerById(auction.currentBidderId);
    const seller = await repo.findPlayerById(auction.sellerId);
    await repo.createEconomyLog({
        playerId: auction.currentBidderId,
        bizType: 'cost',
        deltaSpiritStone: -auction.currentPrice,
        balanceAfter: winner?.spiritStone ?? 0,
        refType: 'auction_bid_win',
        refId: auction.id,
        idempotencyKey: `${auction.currentBidderId}:auction-win:${auction.id}`,
        extraJson: JSON.stringify({sellerId: auction.sellerId, price: auction.currentPrice, feeAmount}),
        now,
    });
    await repo.createEconomyLog({
        playerId: auction.sellerId,
        bizType: 'sell',
        deltaSpiritStone: sellerReceive,
        balanceAfter: seller?.spiritStone ?? 0,
        refType: 'auction_sell',
        refId: auction.id,
        idempotencyKey: `${auction.sellerId}:auction-sell:${auction.id}`,
        extraJson: JSON.stringify({winnerId: auction.currentBidderId, price: auction.currentPrice, feeAmount}),
        now,
    });
    await repo.addAuctionSettlement({
        auctionId: auction.id,
        sellerId: auction.sellerId,
        winnerId: auction.currentBidderId,
        finalPrice: auction.currentPrice,
        feeAmount,
        sellerReceive,
        result: 'sold',
        detailJson: JSON.stringify({winnerId: auction.currentBidderId}),
        now,
    });

    return {
        ok: true,
        text: auctionSettleText({
            auctionId: auction.id,
            itemName,
            finalPrice: auction.currentPrice,
            feeAmount,
            sellerReceive,
            winnerName: winner?.userName ?? `道友${auction.currentBidderId}`,
        }),
    };
}

export async function settleDueAuctions(repo: XiuxianRepository, now: number): Promise<string[]> {
    const due = await repo.listDueActiveAuctions(now, XIUXIAN_AUCTION.settleBatchSize);
    const notices: string[] = [];
    for (const auction of due) {
        const settled = await settleSingleAuction(repo, auction, now);
        if (settled.ok) notices.push(settled.text);
    }
    return notices;
}