import type {HandlerResponse} from '../../../../../types/message.js';
import {calcSellPrice, calcShopPrice, generateShopItems} from '../../core/balance/index.js';
import {XIUXIAN_AUCTION, XIUXIAN_LEDGER_DEFAULT_LIMIT, XIUXIAN_LEDGER_MAX_LIMIT, XIUXIAN_SHOP_OFFER_COUNT, XIUXIAN_SHOP_REFRESH_MS} from '../../core/constants/index.js';
import {
    refineBonusByLevel,
    refineCostForLevel,
    refineMaterialGain,
    XIUXIAN_REFINE_MATERIAL_KEY,
    XIUXIAN_REFINE_MATERIAL_LABEL,
    XIUXIAN_REFINE_SAFETY_CAP,
} from '../../core/refine/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianCommand, XiuxianItem, XiuxianItemQuality, XiuxianPlayer, XiuxianShopOffer} from '../../core/types/index.js';
import {formatBeijingTime} from '../../core/utils/time.js';
import {auctionBidText, auctionCancelText, auctionCreatedText, auctionListText, buyResultText, dismantleResultText, economyLogText, refineDetailText, refineMaterialText, refineResultText, sellBatchResultText, sellResultText, shopText} from './reply.js';
import {parseAuctionBuyoutPrice, parseAuctionItemPayload, settleDueAuctions, settleSingleAuction} from './shared.js';

type EconomyCommandContext = {
    now: number;
    messageId: string;
};

const QUALITY_RANK: Record<XiuxianItemQuality, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    mythic: 6,
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

function qualityLabel(quality: XiuxianItemQuality): string {
    if (quality === 'mythic') return '神话(红)';
    if (quality === 'legendary') return '传说(金)';
    if (quality === 'epic') return '史诗(紫)';
    if (quality === 'rare') return '稀有(蓝)';
    if (quality === 'uncommon') return '优秀(绿)';
    return '普通(白)';
}

function parseOfferItem(offer: XiuxianShopOffer): Omit<XiuxianItem, 'id' | 'playerId' | 'createdAt'> | null {
    try {
        const data = JSON.parse(offer.itemPayloadJson) as Record<string, unknown>;
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

async function ensureShopOffers(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<XiuxianShopOffer[]> {
    const active = await repo.listShopOffers(player.id, now);
    if (active.length > 0) return active;

    const refreshedAt = now;
    const expiresAt = now + XIUXIAN_SHOP_REFRESH_MS;
    const generated = generateShopItems(player.level, XIUXIAN_SHOP_OFFER_COUNT);
    await repo.clearShopOffers(player.id);
    for (let i = 0; i < generated.length; i += 1) {
        const item = generated[i];
        await repo.createShopOffer(
            player.id,
            {
                offerKey: `offer-${player.id}-${refreshedAt}-${i + 1}`,
                itemPayloadJson: JSON.stringify(item),
                priceSpiritStone: calcShopPrice(item),
                stock: 1,
                refreshedAt,
                expiresAt,
            },
            now,
        );
    }
    return repo.listShopOffers(player.id, now);
}

export async function handleEconomyCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: EconomyCommandContext,
): Promise<HandlerResponse | null> {
    if (!context) return null;

    if (cmd.type === 'shop') {
        const offers = await ensureShopOffers(repo, player, context.now);
        return asText(shopText(offers));
    }

    if (cmd.type === 'buy') {
        const idemKey = `${player.id}:buy:${context.messageId}`;
        const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
        if (exists) {
            return asText('🧾 该购买请求已处理，请勿重复提交。');
        }

        const offer = await repo.findShopOffer(player.id, cmd.offerId);
        if (!offer || offer.status !== 'active' || offer.stock <= 0 || offer.expiresAt <= context.now) {
            return asText('🛒 该商品已失效，请先发送「修仙商店」查看最新货架。');
        }

        const itemPayload = parseOfferItem(offer);
        if (!itemPayload) return asText('⚠️ 商品数据异常，请稍后重试。');

        const inventoryCount = await repo.countInventory(player.id);
        if (inventoryCount >= player.backpackCap) {
            return asText('🎒 背包已满，无法购买。先整理背包后再来吧。');
        }

        const sold = await repo.markOfferSold(player.id, offer.id, context.now);
        if (!sold) return asText('🛒 商品已被刷新或售罄，请重新查看「修仙商店」。');

        const paid = await repo.spendSpiritStone(player.id, offer.priceSpiritStone, context.now);
        if (!paid) {
            await repo.restoreOfferStock(player.id, offer.id, context.now);
            return asText(`💸 灵石不足，本商品需要 ${offer.priceSpiritStone} 灵石。`);
        }

        await repo.addItem(player.id, itemPayload, context.now);
        const latest = await repo.findPlayerById(player.id);
        const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - offer.priceSpiritStone);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'buy',
            deltaSpiritStone: -offer.priceSpiritStone,
            balanceAfter,
            refType: 'shop_offer',
            refId: offer.id,
            idempotencyKey: idemKey,
            extraJson: JSON.stringify({itemName: itemPayload.itemName, score: itemPayload.score}),
            now: context.now,
        });
        return asText(buyResultText(offer, itemPayload.itemName, balanceAfter));
    }

    if (cmd.type === 'sell') {
        const idemKey = `${player.id}:sell:${context.messageId}`;
        const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
        if (exists) {
            return asText('🧾 该出售请求已处理，请勿重复提交。');
        }

        let targetIds: number[] = [];
        if (cmd.sellAll) {
            const total = await repo.countInventory(player.id);
            if (total <= 0) return asText('🎒 背包暂无可出售装备。');
            const all = await repo.listInventory(player.id, 1, total);
            targetIds = all.map((value) => value.id);
        } else if (cmd.sellQuality) {
            const total = await repo.countInventory(player.id);
            if (total <= 0) return asText('🎒 背包暂无可出售装备。');
            const all = await repo.listInventory(player.id, 1, total);
            const baseRank = QUALITY_RANK[cmd.sellQuality];
            const matched = all.filter((item) => {
                if (cmd.sellQualityMode === 'at_least') return QUALITY_RANK[item.quality] >= baseRank;
                if (cmd.sellQualityMode === 'at_most') return QUALITY_RANK[item.quality] <= baseRank;
                return item.quality === cmd.sellQuality;
            });
            if (!matched.length) {
                const modeLabel = cmd.sellQualityMode === 'at_least' ? '至少' : cmd.sellQualityMode === 'at_most' ? '至多' : '';
                return asText(`🔎 未找到品质为${modeLabel}${qualityLabel(cmd.sellQuality)}的可出售装备。`);
            }
            targetIds = matched.map((value) => value.id);
        } else {
            targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
            if (!targetIds.length) {
                return asText('💡 用法：修仙出售 [装备ID...] 或 修仙出售 全部 或 修仙出售 品质 稀有以上/稀有以下');
            }
        }

        const equippedIds = new Set([player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter((value): value is number => typeof value === 'number'));
        let soldCount = 0;
        let skippedEquipped = 0;
        let skippedLocked = 0;
        let skippedMissing = 0;
        let gainTotal = 0;
        const soldItems: Array<{id: number; itemName: string; score: number}> = [];

        for (const itemId of targetIds) {
            const item = await repo.findItem(player.id, itemId);
            if (!item) {
                skippedMissing += 1;
                continue;
            }
            if (equippedIds.has(item.id)) {
                skippedEquipped += 1;
                continue;
            }
            if (item.isLocked > 0) {
                skippedLocked += 1;
                continue;
            }

            const removed = await repo.removeItem(player.id, item.id);
            if (!removed) {
                skippedMissing += 1;
                continue;
            }

            const gain = calcSellPrice(item);
            gainTotal += gain;
            soldCount += 1;
            soldItems.push({id: item.id, itemName: item.itemName, score: item.score});
        }

        if (soldCount <= 0) {
            if (skippedEquipped > 0) return asText('🧷 目标装备均为已装备状态，请先「修仙卸装」。');
            if (skippedLocked > 0) return asText('🔒 目标装备均为锁定状态，解锁后再出售。');
            return asText('🔎 未找到可出售的装备编号，请先用「修仙背包」查看。');
        }

        await repo.gainSpiritStone(player.id, gainTotal, context.now);
        const latest = await repo.findPlayerById(player.id);
        const balanceAfter = latest?.spiritStone ?? player.spiritStone + gainTotal;
        const primary = soldItems[0];
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'sell',
            deltaSpiritStone: gainTotal,
            balanceAfter,
            refType: soldCount > 1 ? 'inventory_item_batch' : 'inventory_item',
            refId: soldCount > 1 ? null : primary.id,
            idempotencyKey: idemKey,
            extraJson: JSON.stringify(
                soldCount > 1
                    ? {
                          soldCount,
                          soldItemIds: soldItems.map((value) => value.id),
                          soldItemNames: soldItems.map((value) => value.itemName),
                      }
                    : {itemName: primary.itemName, score: primary.score},
            ),
            now: context.now,
        });

        if (soldCount === 1 && !cmd.sellAll && targetIds.length === 1) {
            return asText(sellResultText(primary.itemName, gainTotal, balanceAfter));
        }
        return asText(
            sellBatchResultText({
                soldCount,
                gain: gainTotal,
                balanceAfter,
                skippedEquipped,
                skippedLocked,
                skippedMissing,
            }),
        );
    }

    if (cmd.type === 'auctionCreate') {
        if (!cmd.itemId || !cmd.startPrice) {
            return asText('💡 用法：修仙上架 [装备ID] [起拍价] [时长分钟] [一口价可选]');
        }
        const durationMinutes = Math.min(
            Math.max(cmd.durationMinutes ?? XIUXIAN_AUCTION.defaultDurationMinutes, XIUXIAN_AUCTION.minDurationMinutes),
            XIUXIAN_AUCTION.maxDurationMinutes,
        );
        const startPrice = Math.max(cmd.startPrice, XIUXIAN_AUCTION.minStartPrice);
        const buyoutPriceRaw = cmd.buyoutPrice ? Math.max(1, Math.floor(cmd.buyoutPrice)) : undefined;
        if (buyoutPriceRaw && buyoutPriceRaw <= startPrice) {
            return asText(`⚠️ 一口价需高于起拍价（当前起拍价 ${startPrice}）。`);
        }
        const item = await repo.findItem(player.id, cmd.itemId);
        if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');
        if (item.isLocked > 0) return asText('🔒 锁定装备不可上架，请先解锁。');
        const equippedIds = new Set([player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter((value): value is number => typeof value === 'number'));
        if (equippedIds.has(item.id)) return asText('🧷 已装备中的法宝不可上架，请先卸装。');

        const removed = await repo.removeItem(player.id, item.id);
        if (!removed) return asText('⚠️ 装备状态已变更，请刷新背包后重试。');

        const endAt = context.now + durationMinutes * 60_000;
        const auctionId = await repo.createAuction({
            sellerId: player.id,
            itemPayloadJson: JSON.stringify({
                itemType: item.itemType,
                itemName: item.itemName,
                itemLevel: item.itemLevel,
                quality: item.quality,
                attack: item.attack,
                defense: item.defense,
                hp: item.hp,
                dodge: item.dodge,
                crit: item.crit,
                score: item.score,
                setKey: item.setKey ?? null,
                setName: item.setName ?? null,
                isLocked: 0,
                buyoutPrice: buyoutPriceRaw ?? null,
            }),
            startPrice,
            minIncrement: XIUXIAN_AUCTION.minIncrement,
            feeRateBp: XIUXIAN_AUCTION.feeRateBp,
            endAt,
            now: context.now,
        });
        return asText(
            auctionCreatedText({
                auctionId,
                itemName: item.itemName,
                startPrice,
                minIncrement: XIUXIAN_AUCTION.minIncrement,
                buyoutPrice: buyoutPriceRaw,
                endAt,
            }),
        );
    }

    if (cmd.type === 'auctionList') {
        const page = Math.max(1, cmd.page ?? 1);
        const notices = await settleDueAuctions(repo, context.now);
        const rows = await repo.listActiveAuctions(page, XIUXIAN_AUCTION.listSize, context.now);
        const panel = auctionListText(rows, page, XIUXIAN_AUCTION.listSize);
        if (!notices.length) return asText(panel);
        return asText([`⚖️ 已自动结算 ${notices.length} 笔到期拍卖`, panel].join('\n\n'));
    }

    if (cmd.type === 'auctionBid') {
        if (!cmd.auctionId || !cmd.bidPrice) {
            return asText('💡 用法：修仙竞拍 [拍卖ID] [出价]');
        }

        const auction = await repo.findAuctionById(cmd.auctionId);
        if (!auction) return asText('🔎 未找到该拍卖编号，请先发送「修仙拍卖」。');
        if (auction.status !== 'active') return asText('📦 该拍卖已结束。');

        if (auction.endAt <= context.now) {
            const settled = await settleSingleAuction(repo, auction, context.now);
            return asText(settled.text);
        }
        if (auction.sellerId === player.id) return asText('😅 不能给自己的拍品出价。');

        const buyoutPrice = parseAuctionBuyoutPrice(auction.itemPayloadJson);
        const minBid = Math.max(auction.startPrice, auction.currentPrice + Math.max(1, auction.minIncrement));
        if (cmd.bidPrice < minBid) {
            return asText(`📌 当前最低可出价：${minBid}。`);
        }
        const hitBuyout = Boolean(buyoutPrice && cmd.bidPrice >= buyoutPrice);
        const finalBidPrice = hitBuyout && buyoutPrice ? buyoutPrice : cmd.bidPrice;
        if (player.spiritStone < finalBidPrice) {
            return asText(`💸 灵石不足，本次出价需要 ${finalBidPrice} 灵石。`);
        }

        const idemKey = `${player.id}:auction-bid:${context.messageId}`;
        const existed = await repo.findAuctionBidByIdempotency(auction.id, idemKey);
        if (existed) return asText('🧾 该竞拍请求已处理，请勿重复提交。');

        const placed = await repo.placeAuctionBid({
            auctionId: auction.id,
            bidderId: player.id,
            bidPrice: finalBidPrice,
            expectedVersion: auction.version,
            idempotencyKey: idemKey,
            now: context.now,
        });
        if (!placed) return asText('⚠️ 竞拍并发较高，你的出价已落后，请刷新拍卖列表后再试。');

        const latest = await repo.findAuctionById(auction.id);
        if (!latest) return asText('⚠️ 出价已提交，但读取拍卖状态失败，请稍后查看。');
        if (hitBuyout) {
            const settled = await settleSingleAuction(repo, latest, context.now);
            if (!settled.ok) return asText(settled.text);
            return asText([`⚡ 已触发拍卖 #${auction.id} 一口价 ${finalBidPrice}，即时成交。`, settled.text].join('\n\n'));
        }
        return asText(
            auctionBidText({
                auction: latest,
                bidPrice: finalBidPrice,
                minNextBid: latest.currentPrice + Math.max(1, latest.minIncrement),
            }),
        );
    }

    if (cmd.type === 'auctionBuyout') {
        if (!cmd.auctionId) return asText('💡 用法：修仙秒拍 [拍卖ID]');
        const auction = await repo.findAuctionById(cmd.auctionId);
        if (!auction) return asText('🔎 未找到该拍卖编号，请先发送「修仙拍卖」。');
        if (auction.status !== 'active') return asText('📦 该拍卖已结束。');
        if (auction.sellerId === player.id) return asText('😅 不能秒拍自己的拍品。');

        const buyoutPrice = parseAuctionBuyoutPrice(auction.itemPayloadJson);
        if (!buyoutPrice) return asText('📌 该拍卖未设置一口价。');
        if (auction.endAt <= context.now) {
            const settled = await settleSingleAuction(repo, auction, context.now);
            return asText(settled.text);
        }
        if (player.spiritStone < buyoutPrice) return asText(`💸 灵石不足，秒拍需要 ${buyoutPrice} 灵石。`);

        const idemKey = `${player.id}:auction-buyout:${context.messageId}`;
        const existed = await repo.findAuctionBidByIdempotency(auction.id, idemKey);
        if (existed) return asText('🧾 该秒拍请求已处理，请勿重复提交。');

        const placed = await repo.placeAuctionBid({
            auctionId: auction.id,
            bidderId: player.id,
            bidPrice: buyoutPrice,
            expectedVersion: auction.version,
            idempotencyKey: idemKey,
            now: context.now,
        });
        if (!placed) return asText('⚠️ 竞拍并发较高，拍卖状态已变化，请刷新后重试。');

        const latest = await repo.findAuctionById(auction.id);
        if (!latest) return asText('⚠️ 秒拍已提交，但读取拍卖状态失败，请稍后查看。');
        const settled = await settleSingleAuction(repo, latest, context.now);
        if (!settled.ok) return asText(settled.text);
        return asText([`⚡ 你已以秒拍价 ${buyoutPrice} 拍下拍卖 #${auction.id}。`, settled.text].join('\n\n'));
    }

    if (cmd.type === 'auctionCancel') {
        if (!cmd.auctionId) return asText('💡 用法：修仙撤拍 [拍卖ID]');
        const auction = await repo.findAuctionById(cmd.auctionId);
        if (!auction) return asText('🔎 未找到该拍卖编号。');
        if (auction.sellerId !== player.id) return asText('🚫 仅卖家本人可撤拍。');
        if (auction.status !== 'active') return asText('📦 该拍卖已结束，无法撤拍。');
        if (auction.endAt <= context.now) return asText('⌛ 拍卖已到期，请使用「修仙拍结」进行结算。');

        const cancelled = await repo.cancelAuctionNoBid(auction.id, player.id, context.now);
        if (!cancelled) return asText('⚠️ 当前拍卖已有出价或状态已变化，撤拍失败。');
        const item = parseAuctionItemPayload(auction.itemPayloadJson);
        if (item) {
            await repo.addItem(player.id, item, context.now);
        }
        await repo.addAuctionSettlement({
            auctionId: auction.id,
            sellerId: auction.sellerId,
            winnerId: null,
            finalPrice: 0,
            feeAmount: 0,
            sellerReceive: 0,
            result: 'cancelled',
            detailJson: JSON.stringify({reason: 'seller_cancel'}),
            now: context.now,
        });
        return asText(auctionCancelText(auction.id, item?.itemName ?? '未知装备'));
    }

    if (cmd.type === 'auctionSettle') {
        if (!cmd.auctionId) {
            const notices = await settleDueAuctions(repo, context.now);
            if (!notices.length) return asText('📭 当前没有可结算的到期拍卖。');
            return asText(`⚖️ 已完成 ${notices.length} 笔拍卖结算。`);
        }
        const auction = await repo.findAuctionById(cmd.auctionId);
        if (!auction) return asText('🔎 未找到该拍卖编号。');
        if (auction.status !== 'active') return asText('🧾 该拍卖已结算。');
        if (auction.endAt > context.now) return asText(`⌛ 该拍卖尚未结束（截止 ${formatBeijingTime(auction.endAt)}）。`);
        const settled = await settleSingleAuction(repo, auction, context.now);
        return asText(settled.text);
    }

    if (cmd.type === 'dismantle') {
        const idemKey = `${player.id}:dismantle:${context.messageId}`;
        const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
        if (exists) return asText('🧾 该分解请求已处理，请勿重复提交。');

        let targetIds: number[] = [];
        if (cmd.dismantleAll) {
            const total = await repo.countInventory(player.id);
            if (total <= 0) return asText('🎒 背包暂无可分解装备。');
            const all = await repo.listInventory(player.id, 1, total);
            targetIds = all.map((value) => value.id);
        } else if (cmd.dismantleQuality) {
            const total = await repo.countInventory(player.id);
            if (total <= 0) return asText('🎒 背包暂无可分解装备。');
            const all = await repo.listInventory(player.id, 1, total);
            const baseRank = QUALITY_RANK[cmd.dismantleQuality];
            const matched = all.filter((item) => {
                if (cmd.dismantleQualityMode === 'at_least') return QUALITY_RANK[item.quality] >= baseRank;
                if (cmd.dismantleQualityMode === 'at_most') return QUALITY_RANK[item.quality] <= baseRank;
                return item.quality === cmd.dismantleQuality;
            });
            if (!matched.length) {
                const modeLabel =
                    cmd.dismantleQualityMode === 'at_least' ? '至少' : cmd.dismantleQualityMode === 'at_most' ? '至多' : '';
                return asText(`🔎 未找到品质为${modeLabel}${qualityLabel(cmd.dismantleQuality)}的可分解装备。`);
            }
            targetIds = matched.map((value) => value.id);
        } else {
            targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
            if (!targetIds.length) {
                return asText('💡 用法：修仙分解 [装备ID...] 或 修仙分解 全部 或 修仙分解 品质 稀有以下');
            }
        }

        const equippedIds = new Set(
            [player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter(
                (value): value is number => typeof value === 'number',
            ),
        );
        let dismantledCount = 0;
        let skippedEquipped = 0;
        let skippedLocked = 0;
        let skippedMissing = 0;
        let gainedEssence = 0;
        const dismantledIds: number[] = [];

        for (const itemId of targetIds) {
            const item = await repo.findItem(player.id, itemId);
            if (!item) {
                skippedMissing += 1;
                continue;
            }
            if (equippedIds.has(item.id)) {
                skippedEquipped += 1;
                continue;
            }
            if (item.isLocked > 0) {
                skippedLocked += 1;
                continue;
            }

            const refineLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;
            const removed = await repo.removeItem(player.id, item.id);
            if (!removed) {
                skippedMissing += 1;
                continue;
            }
            await repo.clearItemRefine(item.id);
            dismantledCount += 1;
            dismantledIds.push(item.id);
            gainedEssence += refineMaterialGain(item, refineLevel);
        }

        if (dismantledCount <= 0) {
            if (skippedEquipped > 0) return asText('🧷 目标装备均为已装备状态，请先「修仙卸装」。');
            if (skippedLocked > 0) return asText('🔒 目标装备均为锁定状态，解锁后再分解。');
            return asText('🔎 未找到可分解的装备编号，请先用「修仙背包」查看。');
        }

        await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, gainedEssence, context.now);
        const essenceAfter = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'other',
            deltaSpiritStone: 0,
            balanceAfter: player.spiritStone,
            refType: 'dismantle',
            refId: dismantledCount === 1 ? dismantledIds[0] : null,
            idempotencyKey: idemKey,
            extraJson: JSON.stringify({
                materialKey: XIUXIAN_REFINE_MATERIAL_KEY,
                materialName: XIUXIAN_REFINE_MATERIAL_LABEL,
                gainedEssence,
                dismantledCount,
                dismantledIds,
            }),
            now: context.now,
        });
        return asText(
            dismantleResultText({
                dismantledCount,
                gainedEssence,
                essenceAfter,
                skippedEquipped,
                skippedLocked,
                skippedMissing,
            }),
        );
    }

    if (cmd.type === 'refine') {
        const essence = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
        if (!cmd.itemId) return asText(refineMaterialText(essence));

        const idemKey = `${player.id}:refine:${context.messageId}`;
        const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
        if (exists) return asText('🧾 该炼器请求已处理，请勿重复提交。');

        const item = await repo.findItem(player.id, cmd.itemId);
        if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');
        if (item.isLocked > 0) return asText('🔒 该装备处于锁定状态，解锁后再炼器。');

        const targetTimes = cmd.infinite ? XIUXIAN_REFINE_SAFETY_CAP : Math.min(Math.max(cmd.times ?? 1, 1), 100);
        const currentLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;

        let doable = 0;
        let needEssence = 0;
        let needStone = 0;
        let essenceLeft = essence;
        let stoneLeft = player.spiritStone;
        let hitSafetyCap = false;
        for (let i = 0; i < targetTimes; i += 1) {
            const level = currentLevel + i;
            const cost = refineCostForLevel(level);
            if (essenceLeft < cost.essence || stoneLeft < cost.stone) break;
            essenceLeft -= cost.essence;
            stoneLeft -= cost.stone;
            needEssence += cost.essence;
            needStone += cost.stone;
            doable += 1;
        }
        if (cmd.infinite && doable >= XIUXIAN_REFINE_SAFETY_CAP) hitSafetyCap = true;

        if (doable <= 0) {
            const nextCost = refineCostForLevel(currentLevel);
            return asText(
                `🧱 炼器材料不足：下一级需要 ${nextCost.essence} ${XIUXIAN_REFINE_MATERIAL_LABEL} + ${nextCost.stone} 灵石（当前 ${essence} / ${player.spiritStone}）。`,
            );
        }

        const consumed = await repo.consumeRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, context.now);
        if (!consumed) return asText('⚠️ 炼器材料扣除失败，请稍后重试。');
        const paid = await repo.spendSpiritStone(player.id, needStone, context.now);
        if (!paid) {
            await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, context.now);
            return asText('💸 灵石不足，炼器已取消。');
        }

        const newLevel = currentLevel + doable;
        const updated = await repo.upsertItemRefineLevel(player.id, item.id, newLevel, context.now);
        if (!updated) {
            await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, context.now);
            await repo.gainSpiritStone(player.id, needStone, context.now);
            return asText('⚠️ 装备状态已变更，炼器已回滚。');
        }

        const latest = await repo.findPlayerById(player.id);
        const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - needStone);
        const essenceAfter = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'cost',
            deltaSpiritStone: -needStone,
            balanceAfter,
            refType: 'refine',
            refId: item.id,
            idempotencyKey: idemKey,
            extraJson: JSON.stringify({
                itemName: item.itemName,
                levelBefore: currentLevel,
                levelAfter: newLevel,
                times: doable,
                essenceCost: needEssence,
                materialKey: XIUXIAN_REFINE_MATERIAL_KEY,
            }),
            now: context.now,
        });

        const body = refineResultText({
            itemName: item.itemName,
            itemId: item.id,
            levelBefore: currentLevel,
            levelAfter: newLevel,
            successTimes: doable,
            essenceCost: needEssence,
            essenceAfter,
            stoneCost: needStone,
            balanceAfter,
        });
        if (cmd.infinite) {
            const tail = hitSafetyCap ? `⛔ 本次已达到单次安全上限 ${XIUXIAN_REFINE_SAFETY_CAP} 次。` : '⏹️ 材料或灵石不足，已自动停止。';
            return asText(`${body}\n━━━━━━━━━━━━\n${tail}`);
        }
        return asText(body);
    }

    if (cmd.type === 'refineDetail') {
        if (!cmd.itemId) return asText('💡 用法：修仙炼器详情 [装备ID]');
        const item = await repo.findItem(player.id, cmd.itemId);
        if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');
        const refineLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;
        const bonus = refineBonusByLevel(item, refineLevel);
        const nextCost = refineCostForLevel(refineLevel);
        const essence = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
        return asText(
            refineDetailText({
                itemName: item.itemName,
                itemId: item.id,
                refineLevel,
                bonus,
                nextCost,
                essence,
                spiritStone: player.spiritStone,
            }),
        );
    }

    if (cmd.type === 'ledger') {
        const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_LEDGER_DEFAULT_LIMIT, 1), XIUXIAN_LEDGER_MAX_LIMIT);
        const logs = await repo.listEconomyLogs(player.id, limit);
        return asText(economyLogText(logs, limit));
    }

    return null;
}