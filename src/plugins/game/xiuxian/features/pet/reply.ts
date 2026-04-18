import type {XiuxianPetBagItem, XiuxianPetBanner} from '../../core/types/index.js';
import {XIUXIAN_TERMS} from '../../core/constants/index.js';
import {formatBeijingTime} from '../../core/utils/time.js';

export function petAdoptText(pet: {petName: string; petType: string; level: number}): string {
    return [
        `🐾 领宠成功：${pet.petName}（${pet.petType}）`,
        '━━━━━━━━━━━━',
        `📶 ${XIUXIAN_TERMS.pet.levelLabel}：${pet.level}`,
        '💡 发送「修仙宠物」查看灵宠状态',
    ].join('\n');
}

export function petStatusText(
    pet: {id?: number; petName: string; petType: string; level: number; exp: number; affection: number; feedCount: number; inBattle?: number},
    growth?: {expNeed: number},
    combat?: {attack: number; defense: number; hp: number},
    exclusive?: {trait: string; skillName: string; skillDesc: string},
): string {
    const bonusStone = Math.floor(pet.level / 5) + (pet.affection >= 50 ? 1 : 0);
    return [
        `🐶 灵宠面板：${pet.petName}${pet.id ? `（#${pet.id}）` : ''}`,
        '━━━━━━━━━━━━',
        `🧬 类型：${pet.petType}`,
        `📶 ${XIUXIAN_TERMS.pet.levelLabel}：${pet.level}`,
        ...(growth ? [`📈 升级进度：${pet.exp}/${growth.expNeed}`] : []),
        `💖 亲密：${pet.affection}/100`,
        `🍼 喂养次数：${pet.feedCount}`,
        `🚩 当前状态：${pet.inBattle === 0 ? '休战' : '出战'}`,
        `✨ 修炼加成：灵石 +${bonusStone}/次`,
        ...(combat ? [`⚔️ 战斗加成：攻+${combat.attack} 防+${combat.defense} 血+${combat.hp}`] : []),
        ...(exclusive ? [`🌟 专属词条：${exclusive.trait}`, `🌀 专属技能：${exclusive.skillName}（${exclusive.skillDesc}）`] : []),
        '💡 喂宠可获得宠物经验并升级；发送「修仙出宠 [编号]」切换出战宠物',
    ].join('\n');
}

export function petBagText(items: XiuxianPetBagItem[], page: number, total: number, pageSize: number): string {
    if (!items.length) return '🎒 宠物背包为空，先去领宠或参与活动获取道具吧。';
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const lines = items.map((it) => `#${it.id} ${it.itemName} x${it.quantity} | 宠物经验系数+${it.feedLevel} | 亲密+${it.feedAffection}`);
    return [`🎒 宠物背包第 ${page}/${pages} 页（共 ${total} 件）`, '━━━━━━━━━━━━', ...lines, '💡 使用：修仙喂宠 [道具ID] [数量]'].join('\n');
}

export function petBattleStateText(petName: string, inBattle: boolean): string {
    return inBattle ? `⚔️ ${petName} 已切换为出战状态。` : `🛌 ${petName} 已切换为休战状态。`;
}

export function petFeedText(
    pet: {petName: string; level: number; exp: number; affection: number},
    cost: number,
    balanceAfter: number,
    gainedExp: number,
    expNeed: number,
    milestoneLines?: string[],
): string {
    return [
        `🍼 喂宠成功：${pet.petName}`,
        '━━━━━━━━━━━━',
        `💎 消耗灵石：${cost}`,
        `🌟 宠物经验 +${gainedExp}`,
        `📶 ${XIUXIAN_TERMS.pet.currentLevelLabel}：${pet.level}`,
        `📈 升级进度：${pet.exp}/${expNeed}`,
        `💖 当前亲密：${pet.affection}/100`,
        `💼 当前灵石：${balanceAfter}`,
        ...(milestoneLines?.length ? ['━━━━━━━━━━━━', ...milestoneLines] : []),
    ].join('\n');
}

export function petPoolText(banner: XiuxianPetBanner, lines: string[]): string {
    return [
        `🎴 当前卡池：${banner.title}`,
        '━━━━━━━━━━━━',
        `🕰️ 开放：${formatBeijingTime(banner.startAt)} ~ ${formatBeijingTime(banner.endAt)}`,
        `💎 单抽消耗：${banner.drawCost}`,
        `🧿 保底：${banner.hardPityUr} 抽必出 UR，${banner.hardPityUp} 抽必出 UP`,
        '━━━━━━━━━━━━',
        ...lines,
        '💡 抽宠：修仙抽宠 [1|10|十连]',
    ].join('\n');
}

export function petDrawResultText(params: {
    drawTimes: number;
    lines: string[];
    feedSummaryLines: string[];
    sinceUr: number;
    hardPityUr: number;
    sinceUp: number;
    hardPityUp: number;
    balanceAfter: number;
}): string {
    return [
        `🎲 抽宠完成 x${params.drawTimes}`,
        '━━━━━━━━━━━━',
        ...params.lines,
        ...(params.feedSummaryLines.length ? ['━━━━━━━━━━━━', ...params.feedSummaryLines] : []),
        '━━━━━━━━━━━━',
        `🧿 当前保底进度：UR ${params.sinceUr}/${params.hardPityUr}，UP ${params.sinceUp}/${params.hardPityUp}`,
        `💎 当前灵石：${params.balanceAfter}`,
    ].join('\n');
}

export function petPityText(banner: XiuxianPetBanner, sinceUr: number, sinceUp: number): string {
    return [
        `🧿 保底进度（${banner.title}）`,
        '━━━━━━━━━━━━',
        `UR 保底：${sinceUr}/${banner.hardPityUr}`,
        `UP 保底：${sinceUp}/${banner.hardPityUp}`,
        `💡 距离 UR 还差：${Math.max(0, banner.hardPityUr - sinceUr)} 抽`,
        `💡 距离 UP 还差：${Math.max(0, banner.hardPityUp - sinceUp)} 抽`,
    ].join('\n');
}