import type {XiuxianAuction, XiuxianAuctionBid, XiuxianEconomyLog, XiuxianShopOffer} from '../../core/types/index.js';
import {formatBeijingTime} from '../../core/utils/time.js';

function qualityLabel(raw: string): string {
    if (raw === 'mythic') return '神话(红)';
    if (raw === 'legendary') return '传说(金)';
    if (raw === 'epic') return '史诗';
    if (raw === 'rare') return '稀有';
    if (raw === 'uncommon') return '优秀(绿)';
    return '普通';
}

function parseAuctionItemName(auction: XiuxianAuction): string {
    try {
        const data = JSON.parse(auction.itemPayloadJson) as Record<string, unknown>;
        const name = String(data.itemName ?? '未知装备');
        const score = Number(data.score ?? 0);
        return `${name}（评分:${score}）`;
    } catch {
        return '未知装备';
    }
}

function parseAuctionBuyoutPrice(auction: XiuxianAuction): number | null {
    if (typeof auction.buyoutPrice === 'number' && auction.buyoutPrice > 0) return auction.buyoutPrice;
    try {
        const data = JSON.parse(auction.itemPayloadJson) as Record<string, unknown>;
        const v = Number(data.buyoutPrice ?? 0);
        return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
    } catch {
        return null;
    }
}

export function shopText(offers: XiuxianShopOffer[]): string {
    if (!offers.length) return '🏪 商店暂无商品，请稍后再试。';
    const expiresAt = formatBeijingTime(offers[0].expiresAt);
    const lines = offers.map((offer) => {
        let itemName = '未知法宝';
        let score = 0;
        let quality = '普通';
        try {
            const data = JSON.parse(offer.itemPayloadJson) as Record<string, unknown>;
            itemName = String(data.itemName ?? itemName);
            score = Number(data.score ?? 0);
            quality = qualityLabel(String(data.quality ?? 'common'));
        } catch {
            // 忽略坏数据，继续展示货架。
        }
        return `#${offer.id} ${itemName} | ${quality} | 评分:${score} | 💎${offer.priceSpiritStone}`;
    });
    return ['🏪 天机商店', '━━━━━━━━━━━━', ...lines, `⏱️ 刷新时间：${expiresAt}`, '💡 购买：修仙购买 [商品ID]'].join('\n');
}

export function buyResultText(offer: XiuxianShopOffer, itemName: string, balanceAfter: number): string {
    return ['✅ 购买成功', '━━━━━━━━━━━━', `🎁 获得：${itemName}`, `💸 花费：${offer.priceSpiritStone} 灵石`, `💎 余额：${balanceAfter}`].join('\n');
}

export function auctionCreatedText(params: {
    auctionId: number;
    itemName: string;
    startPrice: number;
    minIncrement: number;
    buyoutPrice?: number;
    endAt: number;
}): string {
    return [
        `🏷️ 上架成功：拍卖 #${params.auctionId}`,
        '━━━━━━━━━━━━',
        `📦 拍品：${params.itemName}`,
        `💎 起拍价：${params.startPrice}`,
        `📈 最小加价：${params.minIncrement}`,
        ...(params.buyoutPrice && params.buyoutPrice > 0 ? [`⚡ 一口价：${params.buyoutPrice}`] : []),
        `⏰ 截止时间：${formatBeijingTime(params.endAt)}`,
        '💡 竞拍：修仙竞拍 [拍卖ID] [出价]，秒拍：修仙秒拍 [拍卖ID]，结算：修仙拍结 [拍卖ID]',
    ].join('\n');
}

export function auctionListText(rows: XiuxianAuction[], page: number, pageSize: number): string {
    if (!rows.length) return '🏛️ 当前没有进行中的拍卖，发送「修仙上架 [装备ID] [起拍价] [时长分钟]」开拍。';
    const lines = rows.map((auction) => {
        const bidder = auction.currentBidderName?.trim() || (auction.currentBidderId ? `道友${auction.currentBidderId}` : '暂无');
        const buyout = parseAuctionBuyoutPrice(auction);
        return `#${auction.id} ${parseAuctionItemName(auction)} | 卖家:${auction.sellerName?.trim() || `道友${auction.sellerId}`} | 当前:${auction.currentPrice} | 领先:${bidder}${buyout ? ` | 一口:${buyout}` : ''} | 截止:${formatBeijingTime(auction.endAt)}`;
    });
    return [`🏛️ 拍卖行第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines, '💡 竞拍：修仙竞拍 [拍卖ID] [出价]  /  秒拍：修仙秒拍 [拍卖ID]'].join('\n');
}

export function auctionBidText(params: {
    auction: XiuxianAuction;
    bidPrice: number;
    minNextBid: number;
}): string {
    return [
        `💸 出价成功：拍卖 #${params.auction.id}`,
        '━━━━━━━━━━━━',
        `📦 拍品：${parseAuctionItemName(params.auction)}`,
        `💎 当前最高价：${params.bidPrice}`,
        `📌 下一口最低：${params.minNextBid}`,
        `⏰ 截止时间：${formatBeijingTime(params.auction.endAt)}`,
    ].join('\n');
}

export function auctionCancelText(auctionId: number, itemName: string): string {
    return [`🛑 撤拍成功：#${auctionId}`, '━━━━━━━━━━━━', `📦 已返还拍品：${itemName}`].join('\n');
}

export function auctionSettleText(params: {
    auctionId: number;
    itemName: string;
    finalPrice: number;
    feeAmount: number;
    sellerReceive: number;
    winnerName: string;
}): string {
    return [
        `⚖️ 拍卖结算完成：#${params.auctionId}`,
        '━━━━━━━━━━━━',
        `📦 拍品：${params.itemName}`,
        `🏆 赢家：${params.winnerName}`,
        `💎 成交价：${params.finalPrice}`,
        `🏦 手续费：${params.feeAmount}`,
        `📥 卖家到账：${params.sellerReceive}`,
    ].join('\n');
}

export function auctionSettleNoBidText(auctionId: number, itemName: string): string {
    return [`⚖️ 拍卖 #${auctionId} 已流拍`, '━━━━━━━━━━━━', `📦 拍品已返还：${itemName}`].join('\n');
}

export function auctionBidHistoryText(auctionId: number, bids: XiuxianAuctionBid[]): string {
    if (!bids.length) return `📜 拍卖 #${auctionId} 暂无出价记录。`;
    const lines = bids.map((bid, idx) => `${idx + 1}. ${bid.bidderName?.trim() || `道友${bid.bidderId}`}：${bid.bidPrice}（${formatBeijingTime(bid.createdAt)}）`);
    return [`📜 拍卖 #${auctionId} 最近出价`, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function sellResultText(itemName: string, gain: number, balanceAfter: number): string {
    return ['✅ 出售成功', '━━━━━━━━━━━━', `📦 出售：${itemName}`, `💰 获得：${gain} 灵石`, `💎 余额：${balanceAfter}`].join('\n');
}

export function sellBatchResultText(params: {
    soldCount: number;
    gain: number;
    balanceAfter: number;
    skippedEquipped: number;
    skippedMissing: number;
    skippedLocked?: number;
}): string {
    const skippedLocked = params.skippedLocked ?? 0;
    const skipped = params.skippedEquipped + params.skippedMissing + skippedLocked;
    return [
        `✅ 批量出售完成（成功 ${params.soldCount} 件）`,
        '━━━━━━━━━━━━',
        `💰 合计获得：${params.gain} 灵石`,
        `💎 当前余额：${params.balanceAfter}`,
        ...(skipped > 0
            ? [`⏭️ 跳过：${skipped} 件（已装备 ${params.skippedEquipped}，已锁定 ${skippedLocked}，不存在/已处理 ${params.skippedMissing}）`]
            : []),
    ].join('\n');
}

export function dismantleResultText(params: {
    dismantledCount: number;
    gainedEssence: number;
    essenceAfter: number;
    skippedEquipped: number;
    skippedLocked: number;
    skippedMissing: number;
}): string {
    const skipped = params.skippedEquipped + params.skippedLocked + params.skippedMissing;
    return [
        `✅ 分解完成（成功 ${params.dismantledCount} 件）`,
        '━━━━━━━━━━━━',
        `🧱 获得玄铁精华：+${params.gainedEssence}`,
        `🎒 当前玄铁精华：${params.essenceAfter}`,
        ...(skipped > 0
            ? [`⏭️ 跳过：${skipped} 件（已装备 ${params.skippedEquipped}，已锁定 ${params.skippedLocked}，不存在/已处理 ${params.skippedMissing}）`]
            : []),
    ].join('\n');
}

export function refineMaterialText(essence: number): string {
    return ['🔥 炼器材料', '━━━━━━━━━━━━', `🧱 玄铁精华：${essence}`, '💡 炼器：修仙炼器 [装备ID] [次数|无限]'].join('\n');
}

export function refineResultText(params: {
    itemName: string;
    itemId: number;
    levelBefore: number;
    levelAfter: number;
    successTimes: number;
    essenceCost: number;
    essenceAfter: number;
    stoneCost: number;
    balanceAfter: number;
}): string {
    return [
        `🔥 炼器成功：${params.itemName}(#${params.itemId})`,
        '━━━━━━━━━━━━',
        `📈 炼器等级：+${params.successTimes}（${params.levelBefore} -> ${params.levelAfter}）`,
        `🧱 消耗玄铁精华：${params.essenceCost}（剩余 ${params.essenceAfter}）`,
        `💎 消耗灵石：${params.stoneCost}（余额 ${params.balanceAfter}）`,
    ].join('\n');
}

export function refineDetailText(params: {
    itemName: string;
    itemId: number;
    refineLevel: number;
    bonus: {attack: number; defense: number; hp: number; dodge: number; crit: number};
    nextCost: {essence: number; stone: number};
    essence: number;
    spiritStone: number;
}): string {
    return [
        `🧮 炼器详情：${params.itemName}(#${params.itemId})`,
        '━━━━━━━━━━━━',
        `📈 当前炼器等级：+${params.refineLevel}`,
        `⚔️ 当前加成：攻+${params.bonus.attack} 防+${params.bonus.defense} 血+${params.bonus.hp} 闪+${(params.bonus.dodge * 100).toFixed(2)}% 暴+${(params.bonus.crit * 100).toFixed(2)}%`,
        `⬆️ 下一级消耗：🧱${params.nextCost.essence}  💎${params.nextCost.stone}`,
        `🎒 材料/灵石：🧱${params.essence}  💎${params.spiritStone}`,
        '💡 炼器：修仙炼器 [装备ID] [次数]',
    ].join('\n');
}

export function economyLogText(logs: XiuxianEconomyLog[], limit: number): string {
    if (!logs.length) return '📒 暂无经济流水。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        const sign = it.deltaSpiritStone >= 0 ? '+' : '';
        const action = it.bizType === 'buy' ? '购买' : it.bizType === 'sell' ? '出售' : it.bizType;
        return `#${it.id} ${action} ${sign}${it.deltaSpiritStone} | 余额:${it.balanceAfter} | ${dt}`;
    });
    return [`📒 最近 ${Math.min(limit, logs.length)} 条流水`, '━━━━━━━━━━━━', ...lines].join('\n');
}