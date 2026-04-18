import type {HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress} from '../../core/balance/index.js';
import {XIUXIAN_PAGE_SIZE, XIUXIAN_PET_GACHA, XIUXIAN_PET_GROWTH, XIUXIAN_PET_MILESTONE_REWARDS, XIUXIAN_TERMS} from '../../core/constants/index.js';
import type {XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {petAdoptText, petBagText, petBattleStateText, petDrawResultText, petFeedText, petPityText, petPoolText, petStatusText} from './reply.js';
import {ensureWeeklyPetBanner, limitedPetProfileOf, rarityLabel, rollPetDrawEntry} from './shared.js';

type PetCommandContext = {
    now: number;
    messageId: string;
    getPetBonus: (pet: {level: number; affection: number; petType?: string; inBattle?: number} | null) => {attack: number; defense: number; maxHp: number};
};

const XIUXIAN_PET_STARTER_ITEM = {
    itemKey: 'pet-snack-basic',
    itemName: '灵宠饲丸',
    feedLevel: 1,
    feedAffection: 8,
    quantity: 3,
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handlePetCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: PetCommandContext,
): Promise<HandlerResponse | null> {
    if (cmd.type === 'petAdopt') {
        const existedPet = await repo.findPet(player.id);
        if (existedPet) {
            return asText('🐾 每位道友仅可「领宠」一次，后续请通过活动或任务获取新的灵宠。');
        }
        const pool = [
            {name: '灵狐', type: '灵兽'},
            {name: '玄龟', type: '守护'},
            {name: '青鸾', type: '飞羽'},
            {name: '月兔', type: '瑞兽'},
        ];
        const roll = pool[Math.floor(Math.random() * pool.length)];
        const pet = await repo.createPet(player.id, roll.name, roll.type, context?.now ?? Date.now());
        await repo.addPetBagItem(player.id, XIUXIAN_PET_STARTER_ITEM, context?.now ?? Date.now());
        return asText(petAdoptText(pet));
    }

    if (!context) return null;

    if (cmd.type === 'petPool') {
        const {banner, entries} = await ensureWeeklyPetBanner(repo, context.now);
        const lines = entries
            .slice()
            .sort((left, right) => right.weight - left.weight)
            .map((entry) => `${entry.isUp === 1 ? '🌟UP ' : ''}${rarityLabel(entry.rarity)} ${entry.petName}（${entry.petType}） 权重:${entry.weight}`);
        return asText(petPoolText(banner, lines));
    }

    if (cmd.type === 'petDraw') {
        const drawTimes = Math.min(Math.max(cmd.times ?? 1, 1), 10);
        const {banner, entries} = await ensureWeeklyPetBanner(repo, context.now);
        if (!entries.length) return asText('⚠️ 卡池配置为空，请稍后再试。');
        if (context.now < banner.startAt || context.now >= banner.endAt) return asText('⌛ 当前限定卡池未开放，请稍后再来。');

        const idemKey = `${player.id}:pet-draw:${context.messageId}`;
        const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
        if (exists) return asText('🧾 该抽宠请求已处理，请勿重复提交。');

        const totalCost = drawTimes * banner.drawCost;
        if (player.spiritStone < totalCost) {
            return asText(`💸 灵石不足，${drawTimes} 抽需要 ${totalCost} 灵石。`);
        }

        const paid = await repo.spendSpiritStone(player.id, totalCost, context.now);
        if (!paid) return asText(`💸 灵石不足，${drawTimes} 抽需要 ${totalCost} 灵石。`);

        const pityState = await repo.findPetPityState(player.id, banner.bannerKey);
        const pity = {
            totalDraws: pityState?.totalDraws ?? 0,
            sinceUr: pityState?.sinceUr ?? 0,
            sinceUp: pityState?.sinceUp ?? 0,
        };

        const lines: string[] = [];
        const duplicateFeeds: Array<{itemName: string; quantity: number}> = [];
        for (let i = 0; i < drawTimes; i += 1) {
            const result = rollPetDrawEntry(entries, pity, banner.hardPityUr, banner.hardPityUp);
            const rarity = result.entry.rarity;
            const existedPet = await repo.findPetByName(player.id, result.entry.petName);

            let isDuplicate = 0;
            let compensationStone = 0;
            if (existedPet) {
                isDuplicate = 1;
                const feedReward = XIUXIAN_PET_GACHA.duplicateFeedCompensation[rarity];
                compensationStone = feedReward.quantity;
                await repo.addPetBagItem(player.id, feedReward, context.now);
                duplicateFeeds.push({itemName: feedReward.itemName, quantity: feedReward.quantity});
            } else {
                await repo.createPet(player.id, result.entry.petName, result.entry.petType, context.now);
            }

            await repo.addPetDrawLog({
                playerId: player.id,
                bannerKey: banner.bannerKey,
                drawIndex: i + 1,
                petName: result.entry.petName,
                petType: result.entry.petType,
                rarity,
                isUp: result.isUp ? 1 : 0,
                costSpiritStone: banner.drawCost,
                isDuplicate,
                compensationStone,
                idempotencyKey: idemKey,
                now: context.now,
            });

            lines.push(
                `${i + 1}. ${result.isUp ? '🌟' : ''}${rarityLabel(rarity)} ${result.entry.petName}（${result.entry.petType}）${isDuplicate ? ` → 重复转化🧪x${compensationStone}` : ''}`,
            );
        }

        await repo.upsertPetPityState(player.id, banner.bannerKey, pity, context.now);

        const latest = await repo.findPlayerById(player.id);
        const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - totalCost);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'cost',
            deltaSpiritStone: -totalCost,
            balanceAfter,
            refType: 'pet_draw',
            refId: null,
            idempotencyKey: idemKey,
            extraJson: JSON.stringify({bannerKey: banner.bannerKey, draws: drawTimes, duplicateFeeds}),
            now: context.now,
        });

        const feedSummaryMap = new Map<string, number>();
        for (const feed of duplicateFeeds) {
            feedSummaryMap.set(feed.itemName, (feedSummaryMap.get(feed.itemName) ?? 0) + feed.quantity);
        }
        const feedSummaryLines = [...feedSummaryMap.entries()].map(([itemName, quantity]) => `🧪 重复补偿：${itemName} x${quantity}`);

        return asText(
            petDrawResultText({
                drawTimes,
                lines,
                feedSummaryLines,
                sinceUr: pity.sinceUr,
                hardPityUr: banner.hardPityUr,
                sinceUp: pity.sinceUp,
                hardPityUp: banner.hardPityUp,
                balanceAfter,
            }),
        );
    }

    if (cmd.type === 'petPity') {
        const {banner} = await ensureWeeklyPetBanner(repo, context.now);
        const pity = await repo.findPetPityState(player.id, banner.bannerKey);
        const sinceUr = pity?.sinceUr ?? 0;
        const sinceUp = pity?.sinceUp ?? 0;
        return asText(petPityText(banner, sinceUr, sinceUp));
    }

    if (cmd.type === 'petStatus') {
        const pet = cmd.petId ? await repo.findPetById(player.id, cmd.petId) : await repo.findPet(player.id);
        if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
        const bonus = context.getPetBonus(pet);
        const allPets = await repo.listPets(player.id);
        const exclusive = await limitedPetProfileOf(repo, pet.petName);
        const summary = allPets
            .slice(0, 5)
            .map((item) => `#${item.id} ${item.petName}${item.inBattle === 1 ? '（出战）' : ''}`)
            .join('，');
        const panel = petStatusText(
            pet,
            {expNeed: petExpNeed(pet.level)},
            {attack: bonus.attack, defense: bonus.defense, hp: bonus.maxHp},
            exclusive ?? undefined,
        );
        return asText(`${panel}\n━━━━━━━━━━━━\n📚 灵宠列表：${summary || '暂无'}\n💡 查看指定宠物：修仙宠物 [编号]`);
    }

    if (cmd.type === 'petBag') {
        const page = Math.max(1, cmd.page ?? 1);
        const total = await repo.countPetBag(player.id);
        const items = await repo.listPetBag(player.id, page, XIUXIAN_PAGE_SIZE);
        return asText(petBagText(items, page, total, XIUXIAN_PAGE_SIZE));
    }

    if (cmd.type === 'petDeploy') {
        const pet = cmd.petId ? await repo.findPetById(player.id, cmd.petId) : await repo.findPet(player.id);
        if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
        if (pet.inBattle === 1) return asText(`⚔️ ${pet.petName} 当前已经是出战状态。`);
        await repo.deployPetById(player.id, pet.id, context.now);
        return asText(petBattleStateText(pet.petName, true));
    }

    if (cmd.type === 'petRest') {
        const pet = await repo.findPet(player.id);
        if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
        if (pet.inBattle === 0) return asText(`🛌 ${pet.petName} 当前已经是休战状态。`);
        await repo.updatePetBattleState(pet.id, 0, context.now);
        return asText(petBattleStateText(pet.petName, false));
    }

    if (cmd.type === 'petFeed') {
        const pet = await repo.findPet(player.id);
        if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
        if (cmd.itemId) return applyPetBagFeed(repo, player, pet, cmd.itemId, cmd.count ?? 1, context.now);
        const dayKey = dayKeyOf(context.now);
        if (pet.lastFedDay === dayKey) return asText('🍼 今日已喂宠，明日再来吧。');

        const cost = 20 + Math.floor(pet.level / 3) * 5;
        if (player.spiritStone < cost) return asText(`💸 灵石不足，喂宠需要 ${cost} 灵石。`);

        player.spiritStone -= cost;
        await repo.updatePlayer(player, context.now);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'cost',
            deltaSpiritStone: -cost,
            balanceAfter: player.spiritStone,
            refType: 'pet_feed',
            refId: pet.id,
            idempotencyKey: `${player.id}:pet-feed:${dayKey}`,
            extraJson: JSON.stringify({petId: pet.id, petName: pet.petName, dayKey, cost}),
            now: context.now,
        });
        const gainedPetExp = XIUXIAN_PET_GROWTH.dailyFeedExp;
        const growth = applyPetExpProgress(pet, gainedPetExp);
        const affectionAfter = Math.min(100, pet.affection + 6);
        await repo.updatePetFeed(
            pet.id,
            {
                level: growth.level,
                exp: growth.exp,
                affection: affectionAfter,
                feedCountInc: 1,
            },
            dayKey,
            context.now,
        );
        const latest = await repo.findPet(player.id);
        if (!latest) return asText('⚠️ 喂宠后读取失败，请稍后再试。');

        let milestoneStone = 0;
        let milestoneExp = 0;
        let milestoneCultivation = 0;
        const milestoneLines: string[] = [];
        for (const tier of XIUXIAN_PET_MILESTONE_REWARDS) {
            if (pet.level >= tier.level || latest.level < tier.level) continue;
            const claimed = await repo.findPetMilestoneClaim(player.id, tier.level);
            if (claimed) continue;

            milestoneStone += tier.spiritStone;
            milestoneExp += tier.exp;
            milestoneCultivation += tier.cultivation;
            milestoneLines.push(`🎉 达成里程碑 Lv${tier.level}：💎+${tier.spiritStone} 📈+${tier.exp} ✨+${tier.cultivation}`);

            const rewardJson = JSON.stringify({
                petId: latest.id,
                petName: latest.petName,
                milestoneLevel: tier.level,
                spiritStone: tier.spiritStone,
                exp: tier.exp,
                cultivation: tier.cultivation,
            });
            await repo.addPetMilestoneClaim(player.id, latest.id, tier.level, rewardJson, context.now);
        }

        if (milestoneStone > 0 || milestoneExp > 0 || milestoneCultivation > 0) {
            const step = applyExpProgress(player, milestoneExp);
            player.level = step.level;
            player.exp = step.exp;
            player.maxHp = step.maxHp;
            player.attack = step.attack;
            player.defense = step.defense;
            player.hp = step.maxHp;
            player.spiritStone += milestoneStone;
            player.cultivation += milestoneCultivation;
            await repo.updatePlayer(player, context.now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: milestoneStone,
                balanceAfter: player.spiritStone,
                refType: 'pet_milestone',
                refId: latest.id,
                idempotencyKey: `${player.id}:pet-milestone:${dayKey}:${latest.level}`,
                extraJson: JSON.stringify({petId: latest.id, petName: latest.petName, exp: milestoneExp, cultivation: milestoneCultivation}),
                now: context.now,
            });
        }

        return asText(petFeedText(latest, cost, player.spiritStone, gainedPetExp, petExpNeed(latest.level), milestoneLines));
    }

    return null;
}

async function applyPetBagFeed(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    pet: {id: number; petName: string; level: number; exp: number; affection: number},
    itemId: number,
    count: number,
    now: number,
): Promise<HandlerResponse> {
    const bagItem = await repo.findPetBagItem(player.id, itemId);
    if (!bagItem || bagItem.quantity <= 0) return asText('🔎 未找到该宠物道具，请先发送「修仙宠包」查看。');

    const feedCount = Math.max(1, Math.floor(count));
    const consumeCount = Math.min(feedCount, bagItem.quantity);

    const consumed = await repo.consumePetBagItem(player.id, bagItem.id, consumeCount, now);
    if (!consumed) return asText('⚠️ 该宠物道具已被使用，请刷新宠包后重试。');

    const gainedExp = Math.max(0, bagItem.feedLevel) * XIUXIAN_PET_GROWTH.feedExpUnit * consumeCount;
    const growth = applyPetExpProgress(pet, gainedExp);
    const affectionAfter = Math.min(100, pet.affection + Math.max(0, bagItem.feedAffection) * consumeCount);
    await repo.updatePetBagFeed(
        pet.id,
        {
            level: growth.level,
            exp: growth.exp,
            affection: affectionAfter,
            feedCountInc: consumeCount,
        },
        now,
    );
    const latest = await repo.findPet(player.id);
    if (!latest) return asText('⚠️ 喂宠后读取失败，请稍后再试。');

    const expNeed = petExpNeed(latest.level);

    return asText(
        [
            `🧪 使用道具喂宠：${bagItem.itemName} x${consumeCount}`,
            '━━━━━━━━━━━━',
            `🌟 宠物经验 +${gainedExp}`,
            `📶 ${XIUXIAN_TERMS.pet.currentLevelLabel}：${latest.level}`,
            `📈 升级进度：${latest.exp}/${expNeed}`,
            `💖 当前亲密：${latest.affection}/100`,
            `📦 道具剩余：${Math.max(0, bagItem.quantity - consumeCount)}`,
        ].join('\n'),
    );
}

function petExpNeed(level: number): number {
    return Math.floor(
        XIUXIAN_PET_GROWTH.expNeedBase
            + level * XIUXIAN_PET_GROWTH.expNeedLinear
            + level * level * XIUXIAN_PET_GROWTH.expNeedQuadratic,
    );
}

function applyPetExpProgress(pet: {level: number; exp: number}, gainedExp: number): {level: number; exp: number; gainedLevel: number} {
    let level = Math.max(1, Math.floor(pet.level));
    let exp = Math.max(0, Math.floor(pet.exp)) + Math.max(0, Math.floor(gainedExp));
    let gainedLevel = 0;
    while (exp >= petExpNeed(level)) {
        exp -= petExpNeed(level);
        level += 1;
        gainedLevel += 1;
    }
    return {level, exp, gainedLevel};
}

function dayKeyOf(now: number): string {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}