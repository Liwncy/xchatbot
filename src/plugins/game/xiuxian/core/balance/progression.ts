import type {XiuxianPlayer} from '../types/index.js';
import type {ProgressResult} from './models.js';

function expNeed(level: number): number {
    return 100 + (level - 1) * 60;
}

export function applyExpProgress(player: XiuxianPlayer, gainedExp: number): ProgressResult {
    let level = player.level;
    let exp = player.exp + gainedExp;
    let maxHp = player.maxHp;
    let attack = player.attack;
    let defense = player.defense;

    while (exp >= expNeed(level)) {
        exp -= expNeed(level);
        level += 1;
        maxHp += 20;
        attack += 3;
        defense += 2;
    }

    return {level, exp, maxHp, attack, defense};
}

export function cultivateReward(level: number, times: number): {gainedCultivation: number; gainedExp: number; gainedStone: number} {
    const gainedCultivation = times * (8 + level * 2);
    const gainedExp = times * (12 + level);
    const gainedStone = times * (3 + Math.floor(level / 2));
    return {gainedCultivation, gainedExp, gainedStone};
}

export function exploreStoneReward(level: number): number {
    return 6 + Math.floor(level * 1.5) + Math.floor(Math.random() * 8);
}