import {XiuxianRepository} from '../repository/index.js';
import type {XiuxianItem, XiuxianItemQuality} from '../types/index.js';

export const XIUXIAN_REFINE_MATERIAL_KEY = 'refine_essence';
export const XIUXIAN_REFINE_MATERIAL_LABEL = '玄铁精华';
export const XIUXIAN_REFINE_SAFETY_CAP = 500;

const QUALITY_RANK: Record<XiuxianItemQuality, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    mythic: 6,
};

export function refineMaterialGain(item: XiuxianItem, refineLevel: number): number {
    const qualityBase = QUALITY_RANK[item.quality] * 2;
    const scoreBase = Math.max(1, Math.floor(item.score / 22));
    const refineBack = Math.max(0, Math.floor(refineLevel * 0.6));
    return qualityBase + scoreBase + refineBack;
}

export function refineCostForLevel(level: number): {essence: number; stone: number} {
    return {
        essence: 10 + Math.floor(level * 1.6),
        stone: 5 + Math.floor(level * 1.1),
    };
}

export function refineBonusByLevel(item: XiuxianItem, level: number): {attack: number; defense: number; hp: number; dodge: number; crit: number} {
    if (level <= 0) return {attack: 0, defense: 0, hp: 0, dodge: 0, crit: 0};
    const attack = item.itemType === 'weapon' ? level * 2 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level : 0;
    const defense = item.itemType === 'armor' ? level * 2 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level : 0;
    const hp = item.itemType === 'armor' ? level * 18 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level * 10 : 0;
    const dodge = item.itemType === 'accessory' || item.itemType === 'sutra' ? Number((level * 0.0008).toFixed(4)) : 0;
    const crit = item.itemType === 'weapon' || item.itemType === 'accessory' || item.itemType === 'sutra' ? Number((level * 0.001).toFixed(4)) : 0;
    return {attack, defense, hp, dodge, crit};
}

export async function enhanceItemsWithRefine(repo: XiuxianRepository, playerId: number, items: XiuxianItem[]): Promise<XiuxianItem[]> {
    if (!items.length) return items;
    const refineMap = await repo.listItemRefineLevels(
        playerId,
        items.map((value) => value.id),
    );
    return items.map((item) => {
        const refineLevel = refineMap.get(item.id) ?? 0;
        if (refineLevel <= 0) return {...item, refineLevel: 0};
        const bonus = refineBonusByLevel(item, refineLevel);
        return {
            ...item,
            itemName: `${item.itemName}·炼+${refineLevel}`,
            attack: item.attack + bonus.attack,
            defense: item.defense + bonus.defense,
            hp: item.hp + bonus.hp,
            dodge: Number((item.dodge + bonus.dodge).toFixed(4)),
            crit: Number((item.crit + bonus.crit).toFixed(4)),
            score: item.score + Math.floor(bonus.attack * 1.3 + bonus.defense * 1.1 + bonus.hp / 8 + bonus.dodge * 120 + bonus.crit * 130),
            refineLevel,
        };
    });
}