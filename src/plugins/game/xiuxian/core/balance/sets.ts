import type {CombatPower, XiuxianItem, XiuxianPlayer} from '../types/index.js';
import type {PrefixSetConfig, SetBonusSummary, SetStatMod} from './models.js';
import {findPrefixSetByKey} from './prefix-set.js';

function addScaledMod(summary: SetBonusSummary, mod: SetStatMod | undefined, scale = 1): void {
    if (!mod) return;
    summary.attack += (mod.attack ?? 0) * scale;
    summary.defense += (mod.defense ?? 0) * scale;
    summary.maxHp += (mod.maxHp ?? 0) * scale;
    summary.dodge += (mod.dodge ?? 0) * scale;
    summary.crit += (mod.crit ?? 0) * scale;
    summary.attackPct += (mod.attackPct ?? 0) * scale;
    summary.defensePct += (mod.defensePct ?? 0) * scale;
    summary.maxHpPct += (mod.maxHpPct ?? 0) * scale;
    summary.dodgePct += (mod.dodgePct ?? 0) * scale;
    summary.critPct += (mod.critPct ?? 0) * scale;
}

function formatModLine(mod: SetStatMod | undefined): string {
    if (!mod) return '无';
    const fields: string[] = [];
    if (mod.attack) fields.push(`攻+${mod.attack}`);
    if (mod.defense) fields.push(`防+${mod.defense}`);
    if (mod.maxHp) fields.push(`血+${mod.maxHp}`);
    if (mod.dodge) fields.push(`闪+${(mod.dodge * 100).toFixed(2)}%`);
    if (mod.crit) fields.push(`暴+${(mod.crit * 100).toFixed(2)}%`);
    if (mod.attackPct) fields.push(`攻+${(mod.attackPct * 100).toFixed(1)}%`);
    if (mod.defensePct) fields.push(`防+${(mod.defensePct * 100).toFixed(1)}%`);
    if (mod.maxHpPct) fields.push(`血+${(mod.maxHpPct * 100).toFixed(1)}%`);
    if (mod.dodgePct) fields.push(`闪+${(mod.dodgePct * 100).toFixed(1)}%`);
    if (mod.critPct) fields.push(`暴+${(mod.critPct * 100).toFixed(1)}%`);
    return fields.join(' ');
}

export function calcSetBonusSummary(equipped: XiuxianItem[]): SetBonusSummary {
    const grouped = new Map<string, {name: string; pieces: number; cfg?: PrefixSetConfig}>();
    for (const item of equipped) {
        if (!item.setKey || !item.setName) continue;
        const prev = grouped.get(item.setKey);
        if (prev) {
            prev.pieces += 1;
            continue;
        }
        grouped.set(item.setKey, {name: item.setName, pieces: 1, cfg: findPrefixSetByKey(item.setKey)});
    }

    const summary: SetBonusSummary = {
        attack: 0,
        defense: 0,
        maxHp: 0,
        dodge: 0,
        crit: 0,
        attackPct: 0,
        defensePct: 0,
        maxHpPct: 0,
        dodgePct: 0,
        critPct: 0,
        lines: [],
    };
    for (const stat of grouped.values()) {
        addScaledMod(summary, stat.cfg?.single, stat.pieces);
        if (stat.cfg?.single) {
            summary.lines.push(`🔹 ${stat.name} 词缀x${stat.pieces}：${formatModLine(stat.cfg.single)}`);
        }
        if (stat.pieces >= 2) {
            addScaledMod(summary, stat.cfg?.bonus2);
            if (stat.cfg?.bonus2) summary.lines.push(`✨ ${stat.name} 2件：${formatModLine(stat.cfg.bonus2)}`);
        }
        if (stat.pieces >= 4) {
            addScaledMod(summary, stat.cfg?.bonus4);
            if (stat.cfg?.bonus4) summary.lines.push(`🌟 ${stat.name} 4件：${formatModLine(stat.cfg.bonus4)}`);
        }
    }
    return summary;
}

export function calcCombatPower(player: XiuxianPlayer, equipped: XiuxianItem[]): CombatPower {
    const sum = equipped.reduce(
        (acc, item) => {
            acc.attack += item.attack;
            acc.defense += item.defense;
            acc.maxHp += item.hp;
            acc.dodge += item.dodge;
            acc.crit += item.crit;
            return acc;
        },
        {attack: 0, defense: 0, maxHp: 0, dodge: 0, crit: 0},
    );

    const setBonus = calcSetBonusSummary(equipped);
    const attackBase = player.attack + sum.attack + setBonus.attack;
    const defenseBase = player.defense + sum.defense + setBonus.defense;
    const maxHpBase = player.maxHp + sum.maxHp + setBonus.maxHp;
    const dodgeBase = player.dodge + sum.dodge + setBonus.dodge;
    const critBase = player.crit + sum.crit + setBonus.crit;
    return {
        attack: Math.floor(attackBase * (1 + setBonus.attackPct)),
        defense: Math.floor(defenseBase * (1 + setBonus.defensePct)),
        maxHp: Math.floor(maxHpBase * (1 + setBonus.maxHpPct)),
        dodge: Math.min(0.6, Number((dodgeBase * (1 + setBonus.dodgePct)).toFixed(4))),
        crit: Math.min(0.7, Number((critBase * (1 + setBonus.critPct)).toFixed(4))),
    };
}