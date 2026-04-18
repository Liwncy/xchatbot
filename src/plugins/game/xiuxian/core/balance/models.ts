import type {EquipmentSlot, XiuxianItemQuality} from '../types/index.js';

export interface ProgressResult {
    level: number;
    exp: number;
    maxHp: number;
    attack: number;
    defense: number;
}

export interface LootItem {
    itemType: EquipmentSlot;
    itemName: string;
    itemLevel: number;
    quality: XiuxianItemQuality;
    attack: number;
    defense: number;
    hp: number;
    dodge: number;
    crit: number;
    score: number;
    setKey?: string;
    setName?: string;
    isLocked: number;
}

export interface SetBonusSummary {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
    attackPct: number;
    defensePct: number;
    maxHpPct: number;
    dodgePct: number;
    critPct: number;
    lines: string[];
}

export interface SetStatMod {
    attack?: number;
    defense?: number;
    maxHp?: number;
    dodge?: number;
    crit?: number;
    attackPct?: number;
    defensePct?: number;
    maxHpPct?: number;
    dodgePct?: number;
    critPct?: number;
}

export interface PrefixSetConfig {
    prefix: string;
    setKey: string;
    setName: string;
    single?: SetStatMod;
    bonus2?: SetStatMod;
    bonus4?: SetStatMod;
}