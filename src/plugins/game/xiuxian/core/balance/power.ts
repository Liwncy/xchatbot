import type {CombatPower} from '../types/index.js';

type CombatBonus = {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
};

export function petPowerRate(petType: string): {combat: number; cultivateStone: number} {
    if (petType.includes('限定')) return {combat: 1.35, cultivateStone: 1.5};
    if (petType.includes('珍稀')) return {combat: 1.15, cultivateStone: 1.2};
    return {combat: 1, cultivateStone: 1};
}

export function petCultivateStoneBonus(pet: {level: number; affection: number; petType: string} | null, times: number): number {
    if (!pet) return 0;
    const per = Math.floor(pet.level / 5) + (pet.affection >= 50 ? 1 : 0);
    if (per <= 0) return 0;
    const rate = petPowerRate(pet.petType).cultivateStone;
    return Math.floor(per * times * rate);
}

export function petCombatBonus(pet: {level: number; affection: number; petType?: string; inBattle?: number} | null): CombatBonus {
    if (!pet || pet.inBattle === 0) return {attack: 0, defense: 0, maxHp: 0, dodge: 0, crit: 0};
    const rate = petPowerRate(pet.petType ?? '灵兽').combat;
    const attack = Math.floor((Math.floor(pet.level / 4) + (pet.affection >= 60 ? 2 : 0)) * rate);
    const defense = Math.floor((Math.floor(pet.level / 5) + (pet.affection >= 80 ? 2 : 0)) * rate);
    const maxHp = Math.floor((pet.level * 6 + pet.affection) * rate);
    const dodge = pet.affection >= 70 ? 0.01 : 0;
    const crit = pet.affection >= 90 ? 0.01 : 0;
    return {attack, defense, maxHp, dodge, crit};
}

export function mergeCombatPower(base: CombatPower, bonus: CombatBonus): CombatPower {
    return {
        attack: base.attack + bonus.attack,
        defense: base.defense + bonus.defense,
        maxHp: base.maxHp + bonus.maxHp,
        dodge: Math.min(0.6, base.dodge + bonus.dodge),
        crit: Math.min(0.7, base.crit + bonus.crit),
    };
}