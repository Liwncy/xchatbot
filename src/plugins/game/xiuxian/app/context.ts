import type {IncomingMessage, HandlerResponse} from '../../../../types/message.js';
import {
    applyFortuneToPower,
    emptyFortuneBuff,
    fortuneDayKey,
    getFortuneConfig,
    type XiuxianFortuneBuff,
    type XiuxianFortuneLevel,
} from '../features/fortune/index.js';
import {calcCombatPower, mergeCombatPower, petCombatBonus, petCultivateStoneBonus} from '../core/balance/index.js';
import {enhanceItemsWithRefine} from '../core/refine/index.js';
import {XiuxianRepository} from '../core/repository/index.js';
import type {CombatPower, XiuxianIdentity, XiuxianItem, XiuxianPlayer} from '../core/types/index.js';

type CombatCache = {
    playerId: number;
    equipped: XiuxianItem[];
    pet: Awaited<ReturnType<XiuxianRepository['findPet']>>;
};

export function identityFromMessage(message: IncomingMessage): XiuxianIdentity {
    return {platform: 'wechat', userId: message.from};
}

export function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function mustPlayer(repo: XiuxianRepository, identity: XiuxianIdentity): Promise<XiuxianPlayer | null> {
    return repo.findPlayer(identity);
}

export async function checkCooldown(repo: XiuxianRepository, playerId: number, action: string, now: number): Promise<number> {
    const cd = await repo.getCooldown(playerId, action);
    if (!cd) return 0;
    return Math.max(0, cd.nextAt - now);
}

export async function loadTodayFortuneBuff(repo: XiuxianRepository, playerId: number, now: number): Promise<XiuxianFortuneBuff> {
    const record = await repo.findFortuneByDay(playerId, fortuneDayKey(now));
    if (!record) return emptyFortuneBuff();
    try {
        const parsed = JSON.parse(record.buffJson) as Partial<XiuxianFortuneBuff>;
        return {
            cultivateRate: Number(parsed.cultivateRate) || 0,
            exploreRate: Number(parsed.exploreRate) || 0,
            battleAttack: Number(parsed.battleAttack) || 0,
            battleCrit: Number(parsed.battleCrit) || 0,
            battleReward: Number(parsed.battleReward) || 0,
        };
    } catch {
        return emptyFortuneBuff();
    }
}

export function fortuneHintLine(buff: XiuxianFortuneBuff, level?: XiuxianFortuneLevel): string {
    const hasBuff = buff.cultivateRate || buff.exploreRate || buff.battleAttack || buff.battleCrit || buff.battleReward;
    if (!hasBuff && !level) return '';
    const cfg = level ? getFortuneConfig(level) : null;
    const label = cfg ? `${cfg.emoji} 今日卦象：${cfg.title}` : '🔮 今日运势已生效';
    return label;
}

export async function loadPlayerCombatPower(repo: XiuxianRepository, player: XiuxianPlayer): Promise<CombatPower> {
    const equippedRaw = await repo.getEquippedItems(player);
    const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
    const pet = await repo.findPet(player.id);
    return mergeCombatPower(calcCombatPower(player, equipped), petCombatBonus(pet));
}

export function createPetStoneBonusLoader(repo: XiuxianRepository, playerId: number): (times: number) => Promise<number> {
    return async (times) => {
        const pet = await repo.findPet(playerId);
        return petCultivateStoneBonus(pet, times);
    };
}

export function createFortuneCombatPowerLoader(
    repo: XiuxianRepository,
): (player: XiuxianPlayer, fortuneBuff: XiuxianFortuneBuff) => Promise<CombatPower> {
    let cache: CombatCache | undefined;

    return async (player, fortuneBuff) => {
        if (!cache || cache.playerId !== player.id) {
            const equippedRaw = await repo.getEquippedItems(player);
            cache = {
                playerId: player.id,
                equipped: await enhanceItemsWithRefine(repo, player.id, equippedRaw),
                pet: await repo.findPet(player.id),
            };
        }

        return applyFortuneToPower(
            mergeCombatPower(calcCombatPower(player, cache.equipped), petCombatBonus(cache.pet)),
            fortuneBuff,
        );
    };
}