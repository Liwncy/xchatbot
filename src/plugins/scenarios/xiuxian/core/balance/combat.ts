import type {CombatPower} from '../types/index.js';
import {realmName} from '../utils/realm.js';

export function challengeEnemy(level: number): CombatPower & {name: string; level: number} {
    return {
        name: `山野妖兽·${realmName(level)}`,
        level,
        attack: 8 + level * 3,
        defense: 5 + level * 2,
        maxHp: 80 + level * 30,
        dodge: Math.min(0.35, 0.03 + level * 0.002),
        crit: Math.min(0.35, 0.05 + level * 0.002),
    };
}

export function runSimpleBattle(player: CombatPower, enemy: CombatPower): {win: boolean; rounds: number; logs: string[]} {
    let playerHp = player.maxHp;
    let enemyHp = enemy.maxHp;
    const logs: string[] = [];
    let rounds = 0;

    while (playerHp > 0 && enemyHp > 0 && rounds < 20) {
        rounds += 1;
        const pHit = Math.random() >= enemy.dodge;
        if (pHit) {
            const pCrit = Math.random() < player.crit;
            const pDmgBase = Math.max(1, player.attack - enemy.defense);
            const pDmg = pCrit ? Math.floor(pDmgBase * 1.6) : pDmgBase;
            enemyHp -= pDmg;
            logs.push(`第${rounds}回合：你造成${pDmg}伤害${pCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你的攻击被闪避`);
        }
        if (enemyHp <= 0) break;

        const eHit = Math.random() >= player.dodge;
        if (eHit) {
            const eCrit = Math.random() < enemy.crit;
            const eDmgBase = Math.max(1, enemy.attack - player.defense);
            const eDmg = eCrit ? Math.floor(eDmgBase * 1.5) : eDmgBase;
            playerHp -= eDmg;
            logs.push(`第${rounds}回合：敌人造成${eDmg}伤害${eCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你闪避了敌人的攻击`);
        }
    }

    return {win: enemyHp <= 0 && playerHp > 0, rounds, logs};
}

export function bossEnemy(level: number): CombatPower & {name: string; level: number} {
    return {
        name: `镇域魔主·${realmName(level + 2)}`,
        level: level + 2,
        attack: 16 + level * 4,
        defense: 10 + level * 3,
        maxHp: 220 + level * 55,
        dodge: Math.min(0.28, 0.05 + level * 0.002),
        crit: Math.min(0.32, 0.08 + level * 0.002),
    };
}

export function bossRewards(level: number, win: boolean): {gainedExp: number; gainedStone: number; gainedCultivation: number} {
    if (!win) {
        return {
            gainedExp: 8 + level * 2,
            gainedStone: 6 + level,
            gainedCultivation: 10 + level * 2,
        };
    }
    return {
        gainedExp: 40 + level * 8,
        gainedStone: 30 + level * 5,
        gainedCultivation: 45 + level * 7,
    };
}

export function runBossBattle(player: CombatPower, enemy: CombatPower): {win: boolean; rounds: number; logs: string[]; enemyHpLeft: number} {
    let playerHp = player.maxHp;
    let enemyHp = enemy.maxHp;
    const logs: string[] = [];
    let rounds = 0;

    while (playerHp > 0 && enemyHp > 0 && rounds < 25) {
        rounds += 1;
        const pHit = Math.random() >= enemy.dodge;
        if (pHit) {
            const pCrit = Math.random() < player.crit;
            const pDmgBase = Math.max(1, player.attack - enemy.defense);
            const pDmg = pCrit ? Math.floor(pDmgBase * 1.75) : pDmgBase;
            enemyHp -= pDmg;
            logs.push(`第${rounds}回合：你对BOSS造成${pDmg}伤害${pCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你的攻击被BOSS闪避`);
        }
        if (enemyHp <= 0) break;

        const eHit = Math.random() >= player.dodge;
        if (eHit) {
            const eCrit = Math.random() < enemy.crit;
            const eDmgBase = Math.max(1, enemy.attack - player.defense);
            const eDmg = eCrit ? Math.floor(eDmgBase * 1.6) : eDmgBase;
            playerHp -= eDmg;
            logs.push(`第${rounds}回合：BOSS造成${eDmg}伤害${eCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你闪避了BOSS攻击`);
        }
    }

    return {win: enemyHp <= 0 && playerHp > 0, rounds, logs, enemyHpLeft: Math.max(0, enemyHp)};
}