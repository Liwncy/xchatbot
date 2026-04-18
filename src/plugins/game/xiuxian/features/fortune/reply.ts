import {getFortuneConfig, nextRerollCost, type XiuxianFortuneBuff, type XiuxianFortuneLevel} from './buff.js';

function formatFortuneBuffLines(buff: XiuxianFortuneBuff): string[] {
    const fmtPct = (v: number): string => {
        if (!v) return '0%';
        const pct = Math.round(v * 1000) / 10;
        return `${pct > 0 ? '+' : ''}${pct}%`;
    };
    const fmtAbs = (v: number): string => {
        if (!v) return '+0%';
        const pct = Math.round(v * 1000) / 10;
        return `${pct > 0 ? '+' : ''}${pct}%`;
    };
    return [
        `?? �������� ${fmtPct(buff.cultivateRate)}`,
        `?? ̽����ʯ ${fmtPct(buff.exploreRate)}`,
        `??? ս������ ${fmtPct(buff.battleAttack)}`,
        `?? ������ ${fmtAbs(buff.battleCrit)}`,
        `?? ս������ ${fmtPct(buff.battleReward)}`,
    ];
}

export function fortuneDrawText(params: {
    level: XiuxianFortuneLevel;
    buff: XiuxianFortuneBuff;
    sign: string;
    dayKey: string;
    reroll?: {cost: number; totalSpent: number; count: number};
}): string {
    const cfg = getFortuneConfig(params.level);
    const title = params.reroll ? '?? ���˳ɹ�' : '?? ����ռ��';
    const headerNote = params.reroll
        ? `?? ���θ���������ʯ��${params.reroll.cost}�������ۼƸ��� ${params.reroll.count} �Σ��ۼ����� ${params.reroll.totalSpent}��`
        : `?? ���ڣ�${params.dayKey}`;
    const next = nextRerollCost(params.reroll?.count ?? 0);
    const nextHint = next == null ? '?? ���ո��˴����Ѵ�����' : `?? �ٴθ���������ʯ��${next}�����͡����ɸ��ˡ���`;
    return [
        title,
        '������������������������',
        `${cfg.emoji} ����${cfg.title}`,
        headerNote,
        params.sign ? `?? ǩ�ģ�${params.sign}` : '',
        '������������������������',
        ...formatFortuneBuffLines(params.buff),
        ...(cfg.note ? ['������������������������', `?? ${cfg.note}`] : []),
        '������������������������',
        nextHint,
    ]
        .filter(Boolean)
        .join('\n');
}

export function fortuneStatusText(params: {
    level: XiuxianFortuneLevel;
    buff: XiuxianFortuneBuff;
    sign: string;
    dayKey: string;
    rerollCount: number;
    rerollSpent: number;
}): string {
    const cfg = getFortuneConfig(params.level);
    const next = nextRerollCost(params.rerollCount);
    const nextHint = next == null ? '?? ���ո��˴����Ѵ�����' : `?? ����������ʯ��${next}�����͡����ɸ��ˡ���`;
    return [
        '?? ��������',
        '������������������������',
        `${cfg.emoji} ����${cfg.title}`,
        `?? ���ڣ�${params.dayKey}`,
        params.sign ? `?? ǩ�ģ�${params.sign}` : '',
        params.rerollCount > 0 ? `?? ���ո��� ${params.rerollCount} �Σ��ۼ�������ʯ ${params.rerollSpent}` : '',
        '������������������������',
        ...formatFortuneBuffLines(params.buff),
        '������������������������',
        nextHint,
    ]
        .filter(Boolean)
        .join('\n');
}

export function fortuneNotYetText(): string {
    return ['?? ������δռ��', '?? ���͡�����ռ������ȡ�������ơ�'].join('\n');
}

export function fortuneAlreadyDrewText(): string {
    return ['?? ������ռ����һ�Σ��´�������ճ���', '?? ���͡��������ơ��鿴��������', '?? ���͡����ɸ��ˡ�������ʯ�س顣'].join('\n');
}

export function fortuneRerollCapText(rerollCount: number, rerollSpent: number): string {
    return [
        '?? ���ո��˴����Ѵ�����',
        `?? �Ѹ��� ${rerollCount} �Σ��ۼ�������ʯ ${rerollSpent}`,
        '?? ���͡��������ơ��鿴��ǰ����',
    ].join('\n');
}

export function fortuneRerollNotEnoughText(cost: number, balance: number): string {
    return [`?? ��ʯ���㣬�޷����ˣ���Ҫ ${cost}����ǰ ${balance}����`, '?? ���͡��������ơ��鿴��ǰ����'].join('\n');
}