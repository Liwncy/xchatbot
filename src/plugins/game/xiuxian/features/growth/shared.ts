import {XIUXIAN_ACTIONS} from '../../core/constants/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianAchievementDef, XiuxianPlayer, XiuxianTaskDef} from '../../core/types/index.js';

export function dayKeyOf(now: number): string {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseJsonRecord(raw: string): Record<string, unknown> {
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object') return {};
        return value as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function rewardFromJson(raw: string): {spiritStone: number; exp: number; cultivation: number} {
    const reward = parseJsonRecord(raw);
    return {
        spiritStone: Number(reward.spiritStone ?? 0),
        exp: Number(reward.exp ?? 0),
        cultivation: Number(reward.cultivation ?? 0),
    };
}

async function ensureTaskDefs(repo: XiuxianRepository, now: number): Promise<void> {
    await repo.upsertTaskDef({
        code: 'daily_checkin_1',
        title: '晨修签到',
        description: '完成一次修仙签到。',
        taskType: 'daily',
        targetValue: 1,
        requirementJson: JSON.stringify({type: 'checkin_count_daily'}),
        rewardJson: JSON.stringify({spiritStone: 20, exp: 10, cultivation: 10}),
        sortOrder: 10,
        now,
    });
    await repo.upsertTaskDef({
        code: 'daily_cultivate_3',
        title: '勤修不辍',
        description: '当日累计修炼 3 次。',
        taskType: 'daily',
        targetValue: 3,
        requirementJson: JSON.stringify({type: 'cooldown_day_count', action: XIUXIAN_ACTIONS.cultivate}),
        rewardJson: JSON.stringify({spiritStone: 35, exp: 30, cultivation: 25}),
        sortOrder: 20,
        now,
    });
    await repo.upsertTaskDef({
        code: 'daily_explore_2',
        title: '洞天寻宝',
        description: '当日累计探索 2 次。',
        taskType: 'daily',
        targetValue: 2,
        requirementJson: JSON.stringify({type: 'cooldown_day_count', action: XIUXIAN_ACTIONS.explore}),
        rewardJson: JSON.stringify({spiritStone: 30, exp: 20, cultivation: 15}),
        sortOrder: 30,
        now,
    });
}

async function ensureAchievementDefs(repo: XiuxianRepository, now: number): Promise<void> {
    await repo.upsertAchievementDef({
        code: 'ach_checkin_3',
        title: '初入仙门',
        description: '累计签到 3 天。',
        targetValue: 3,
        requirementJson: JSON.stringify({type: 'checkin_total'}),
        rewardJson: JSON.stringify({spiritStone: 120, exp: 80, cultivation: 60}),
        sortOrder: 10,
        now,
    });
    await repo.upsertAchievementDef({
        code: 'ach_battle_win_5',
        title: '锋芒初现',
        description: '累计挑战胜利 5 次。',
        targetValue: 5,
        requirementJson: JSON.stringify({type: 'battle_win_total'}),
        rewardJson: JSON.stringify({spiritStone: 150, exp: 100, cultivation: 80}),
        sortOrder: 20,
        now,
    });
}

async function resolveTaskProgress(repo: XiuxianRepository, player: XiuxianPlayer, task: XiuxianTaskDef, todayKey: string): Promise<number> {
    const rule = parseJsonRecord(task.requirementJson);
    const type = String(rule.type ?? '');
    if (type === 'checkin_count_daily') {
        const checkin = await repo.findCheckin(player.id, todayKey);
        return checkin ? 1 : 0;
    }
    if (type === 'cooldown_day_count') {
        const action = String(rule.action ?? '');
        const cooldown = await repo.getCooldown(player.id, action);
        if (!cooldown || cooldown.dayKey !== todayKey) return 0;
        return cooldown.dayCount;
    }
    return 0;
}

export async function syncDailyTasks(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<void> {
    await ensureTaskDefs(repo, now);
    const todayKey = dayKeyOf(now);
    const defs = await repo.listTaskDefs();
    for (const def of defs) {
        const progress = await resolveTaskProgress(repo, player, def, todayKey);
        const capped = Math.min(progress, def.targetValue);
        const status = capped >= def.targetValue ? 'claimable' : 'in_progress';
        await repo.upsertPlayerTaskProgress(player.id, def.id, todayKey, capped, def.targetValue, status, now);
    }
}

async function computeAchievementProgress(repo: XiuxianRepository, player: XiuxianPlayer, def: XiuxianAchievementDef): Promise<number> {
    const rule = parseJsonRecord(def.requirementJson);
    const type = String(rule.type ?? '');
    if (type === 'checkin_total') {
        return repo.countCheckins(player.id);
    }
    if (type === 'battle_win_total') {
        return repo.countBattleWins(player.id);
    }
    return 0;
}

export async function syncAchievements(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<void> {
    await ensureAchievementDefs(repo, now);
    const defs = await repo.listAchievementDefs();
    for (const def of defs) {
        const progress = await computeAchievementProgress(repo, player, def);
        const capped = Math.min(progress, def.targetValue);
        const status = capped >= def.targetValue ? 'claimable' : 'in_progress';
        await repo.upsertPlayerAchievementProgress(player.id, def.id, capped, def.targetValue, status, status === 'claimable' ? now : null, now);
    }
}