import {XIUXIAN_PET_GACHA} from '../../core/constants/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianPetBanner, XiuxianPetBannerEntry} from '../../core/types/index.js';
import {towerSeasonKey, weekStartOf} from '../tower/shared.js';

const XIUXIAN_LIMITED_PET_POOL = [
    {
        petName: '九霄青鸾',
        petType: '限定',
        rarity: 'ur',
        weight: 50,
        isUp: 1,
        exclusiveTrait: '天风庇佑：最终伤害小幅提升',
        skillName: '九霄风域',
        skillDesc: '每 5 次修炼额外获得 1 次灵石结算',
    },
    {
        petName: '玄冥白泽',
        petType: '限定',
        rarity: 'ur',
        weight: 50,
        isUp: 0,
        exclusiveTrait: '玄冥守意：防御与气血成长更高',
        skillName: '白泽灵护',
        skillDesc: '出战时额外提升防御与气血加成',
    },
    {
        petName: '赤焰灵狐',
        petType: '珍稀',
        rarity: 'sr',
        weight: 280,
        isUp: 0,
        exclusiveTrait: '炎脉活化：暴击成长增强',
        skillName: '赤炎追击',
        skillDesc: '亲密度达到 90 时提升额外暴击收益',
    },
    {
        petName: '沧浪灵龟',
        petType: '珍稀',
        rarity: 'sr',
        weight: 280,
        isUp: 0,
        exclusiveTrait: '潮息共鸣：修炼收益稳定提升',
        skillName: '沧浪稳息',
        skillDesc: '修炼时灵石加成更平滑，波动更小',
    },
    {
        petName: '风语月兔',
        petType: '灵兽',
        rarity: 'r',
        weight: 620,
        isUp: 0,
        exclusiveTrait: '风语轻盈：闪避判定略有提升',
        skillName: '月影步',
        skillDesc: '高亲密时更容易触发闪避收益',
    },
] as const;

export type PetDrawPityProgress = {
    totalDraws: number;
    sinceUr: number;
    sinceUp: number;
};

export async function limitedPetProfileOf(
    repo: XiuxianRepository,
    petName: string,
): Promise<{trait: string; skillName: string; skillDesc: string} | null> {
    const fromDb = await repo.findPetExclusiveProfileByName(petName);
    if (fromDb) {
        return {
            trait: fromDb.exclusiveTrait,
            skillName: fromDb.skillName,
            skillDesc: fromDb.skillDesc,
        };
    }

    const item = XIUXIAN_LIMITED_PET_POOL.find((entry) => entry.petName === petName);
    if (!item) return null;
    return {
        trait: item.exclusiveTrait,
        skillName: item.skillName,
        skillDesc: item.skillDesc,
    };
}

export function rarityLabel(rarity: string): string {
    if (rarity === 'ur') return 'UR';
    if (rarity === 'sr') return 'SR';
    return 'R';
}

export async function ensureWeeklyPetBanner(repo: XiuxianRepository, now: number): Promise<{banner: XiuxianPetBanner; entries: XiuxianPetBannerEntry[]}> {
    const dayMs = 24 * 60 * 60 * 1000;
    const season = towerSeasonKey(now);
    const bannerKey = `pet-weekly-${season}`;
    const startAt = weekStartOf(now);
    const endAt = startAt + 7 * dayMs;
    const upPet = XIUXIAN_LIMITED_PET_POOL.find((entry) => entry.rarity === 'ur' && entry.isUp === 1)?.petName ?? null;

    await repo.upsertPetBanner(
        {
            bannerKey,
            title: `${season} 限定灵宠卡池`,
            status: 'active',
            startAt,
            endAt,
            drawCost: XIUXIAN_PET_GACHA.drawCost,
            hardPityUr: XIUXIAN_PET_GACHA.hardPityUr,
            hardPityUp: XIUXIAN_PET_GACHA.hardPityUp,
            upPetName: upPet,
        },
        now,
    );
    const banner = await repo.findPetBannerByKey(bannerKey);
    if (!banner) throw new Error('限定卡池初始化失败');
    const entries = await repo.listPetBannerEntries(banner.id);
    if (!entries.length) {
        await repo.replacePetBannerEntries(banner.id, [...XIUXIAN_LIMITED_PET_POOL]);
    }

    const active = await repo.findActivePetBanner(now);
    if (active) {
        const activeEntries = await repo.listPetBannerEntries(active.id);
        return {banner: active, entries: activeEntries};
    }
    return {banner, entries: await repo.listPetBannerEntries(banner.id)};
}

function pickByWeight(entries: XiuxianPetBannerEntry[]): XiuxianPetBannerEntry {
    const safe = entries.filter((entry) => entry.weight > 0);
    if (!safe.length) throw new Error('卡池权重配置为空');
    const total = safe.reduce((sum, entry) => sum + entry.weight, 0);
    let point = Math.random() * total;
    for (const entry of safe) {
        point -= entry.weight;
        if (point <= 0) return entry;
    }
    return safe[safe.length - 1];
}

function urRateByPity(sinceUr: number): number {
    if (sinceUr < XIUXIAN_PET_GACHA.softPityStart) return XIUXIAN_PET_GACHA.baseUrRate;
    const extra = (sinceUr - XIUXIAN_PET_GACHA.softPityStart + 1) * XIUXIAN_PET_GACHA.softPityStep;
    return Math.min(1, XIUXIAN_PET_GACHA.baseUrRate + extra);
}

export function rollPetDrawEntry(
    entries: XiuxianPetBannerEntry[],
    pity: PetDrawPityProgress,
    hardPityUr: number,
    hardPityUp: number,
): {entry: XiuxianPetBannerEntry; isUr: boolean; isUp: boolean} {
    const urEntries = entries.filter((entry) => entry.rarity === 'ur');
    const upUrEntries = urEntries.filter((entry) => entry.isUp === 1);
    const fallbackEntries = entries.filter((entry) => entry.rarity !== 'ur');

    const mustUr = pity.sinceUr + 1 >= hardPityUr;
    const hitUr = mustUr || Math.random() < urRateByPity(pity.sinceUr);

    if (hitUr) {
        const mustUp = pity.sinceUp + 1 >= hardPityUp;
        const wantUp = mustUp || Math.random() < XIUXIAN_PET_GACHA.upUrRate;
        const entry = wantUp && upUrEntries.length > 0 ? pickByWeight(upUrEntries) : urEntries.length > 0 ? pickByWeight(urEntries) : pickByWeight(entries);
        const isUp = entry.isUp === 1;
        pity.totalDraws += 1;
        pity.sinceUr = 0;
        pity.sinceUp = isUp ? 0 : pity.sinceUp + 1;
        return {entry, isUr: true, isUp};
    }

    const entry = fallbackEntries.length > 0 ? pickByWeight(fallbackEntries) : pickByWeight(entries);
    pity.totalDraws += 1;
    pity.sinceUr += 1;
    pity.sinceUp += 1;
    return {entry, isUr: false, isUp: false};
}