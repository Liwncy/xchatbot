import {applyExpProgress} from '../../core/balance/index.js';
import {XIUXIAN_TOWER, XIUXIAN_TOWER_SEASON_REWARDS} from '../../core/constants/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianPlayer} from '../../core/types/index.js';
import {realmName} from '../../core/utils/realm.js';

export type TowerSeasonReward = {spiritStone: number; exp: number; cultivation: number};

export type TowerSeasonAutoClaim = {
    seasonKey: string;
    rank: number;
    reward: TowerSeasonReward;
};

export function towerSeasonKey(now: number): string {
    const dt = new Date(now + 8 * 60 * 60 * 1000);
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const year = dt.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

export function previousTowerSeasonKey(now: number): string {
    return towerSeasonKey(now - 7 * 24 * 60 * 60 * 1000);
}

export function towerSeasonWindow(now: number): {seasonKey: string; settleAt: number} {
    const dayMs = 24 * 60 * 60 * 1000;
    const bjNowMs = now + 8 * 60 * 60 * 1000;
    const bj = new Date(bjNowMs);
    const weekDay = bj.getUTCDay() === 0 ? 7 : bj.getUTCDay();
    const midnight = new Date(bj);
    midnight.setUTCHours(0, 0, 0, 0);
    const weekStartBj = midnight.getTime() - (weekDay - 1) * dayMs;
    const nextWeekStartUtc = weekStartBj + 7 * dayMs - 8 * 60 * 60 * 1000;
    return {
        seasonKey: towerSeasonKey(now),
        settleAt: nextWeekStartUtc,
    };
}

export function weekStartOf(now: number): number {
    const dayMs = 24 * 60 * 60 * 1000;
    const bjNowMs = now + 8 * 60 * 60 * 1000;
    const bj = new Date(bjNowMs);
    const weekDay = bj.getUTCDay() === 0 ? 7 : bj.getUTCDay();
    const midnight = new Date(bj);
    midnight.setUTCHours(0, 0, 0, 0);
    const weekStartBj = midnight.getTime() - (weekDay - 1) * dayMs;
    return weekStartBj - 8 * 60 * 60 * 1000;
}

export function seasonRewardByRank(rank: number): TowerSeasonReward | null {
    for (const tier of XIUXIAN_TOWER_SEASON_REWARDS) {
        if (rank <= tier.maxRank) {
            return {
                spiritStone: tier.spiritStone,
                exp: tier.exp,
                cultivation: tier.cultivation,
            };
        }
    }
    return null;
}

export async function tryAutoClaimPreviousSeasonReward(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    now: number,
): Promise<TowerSeasonAutoClaim | null> {
    const lastSeason = previousTowerSeasonKey(now);
    const claimed = await repo.findTowerSeasonClaim(player.id, lastSeason);
    if (claimed) return null;

    const rankRow = await repo.findTowerSeasonRank(lastSeason, player.id);
    if (!rankRow?.rank) return null;

    const reward = seasonRewardByRank(rankRow.rank);
    if (!reward) return null;

    const progress = applyExpProgress(player, reward.exp);
    player.level = progress.level;
    player.exp = progress.exp;
    player.maxHp = progress.maxHp;
    player.attack = progress.attack;
    player.defense = progress.defense;
    player.hp = progress.maxHp;
    player.spiritStone += reward.spiritStone;
    player.cultivation += reward.cultivation;
    await repo.updatePlayer(player, now);

    const rewardJson = JSON.stringify({
        seasonKey: lastSeason,
        rank: rankRow.rank,
        spiritStone: reward.spiritStone,
        exp: reward.exp,
        cultivation: reward.cultivation,
        source: 'auto_on_participation',
    });
    await repo.addTowerSeasonClaim(player.id, lastSeason, rankRow.rank, rewardJson, now);
    await repo.createEconomyLog({
        playerId: player.id,
        bizType: 'reward',
        deltaSpiritStone: reward.spiritStone,
        balanceAfter: player.spiritStone,
        refType: 'tower_season',
        refId: rankRow.rank,
        idempotencyKey: `${player.id}:tower-season-auto:${lastSeason}`,
        extraJson: rewardJson,
        now,
    });

    return {
        seasonKey: lastSeason,
        rank: rankRow.rank,
        reward,
    };
}

export function towerEnemy(level: number, floor: number): {name: string; attack: number; defense: number; maxHp: number; dodge: number; crit: number} {
    const cfg = XIUXIAN_TOWER.enemy;
    const spikeSteps = floor > cfg.floorSpikeStart
        ? Math.floor((floor - cfg.floorSpikeStart - 1) / cfg.floorSpikeEvery) + 1
        : 0;
    const attackMul = 1 + spikeSteps * cfg.spikeAttackPct;
    const defenseMul = 1 + spikeSteps * cfg.spikeDefensePct;
    const hpMul = 1 + spikeSteps * cfg.spikeHpPct;

    const attackRaw = cfg.baseAttack + level * cfg.levelAttack + floor * cfg.floorAttack;
    const defenseRaw = cfg.baseDefense + level * cfg.levelDefense + floor * cfg.floorDefense;
    const hpRaw = cfg.baseHp + level * cfg.levelHp + floor * cfg.floorHp;

    return {
        name: `镇塔守卫·${realmName(level)}（第${floor}层）`,
        attack: Math.floor(attackRaw * attackMul),
        defense: Math.floor(defenseRaw * defenseMul),
        maxHp: Math.floor(hpRaw * hpMul),
        dodge: Math.min(cfg.dodgeCap, cfg.dodgeBase + floor * cfg.dodgePerFloor),
        crit: Math.min(cfg.critCap, cfg.critBase + floor * cfg.critPerFloor),
    };
}

export function towerRewards(level: number, floor: number, win: boolean): TowerSeasonReward {
    if (!win) {
        return {
            spiritStone: 2 + Math.floor(floor / 3),
            exp: 5 + level + floor,
            cultivation: 6 + level + floor,
        };
    }
    return {
        spiritStone: 10 + floor * 3,
        exp: 20 + level * 2 + floor * 6,
        cultivation: 25 + level * 2 + floor * 5,
    };
}