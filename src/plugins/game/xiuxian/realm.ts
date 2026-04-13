const MAX_REALM_LEVEL = 144;
const LEVELS_PER_STAGE = 9;

const NUMBER_NAME: Record<number, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
};

const STAGE_NAME = [
    '筑基',
    '开光',
    '胎息',
    '辟谷',
    '金丹',
    '元婴',
    '出窍',
    '分神',
    '合体',
    '大乘',
    '渡劫',
    '地仙',
    '天仙',
    '金仙',
    '大罗金仙',
    '九天玄仙',
];

export function realmName(level: number): string {
    if (level <= 0) return '凡人';
    if (level >= MAX_REALM_LEVEL) return '九天玄仙九层';
    const stageIndex = Math.floor((level - 1) / LEVELS_PER_STAGE);
    const stageLevel = ((level - 1) % LEVELS_PER_STAGE) + 1;
    return `${STAGE_NAME[stageIndex]}${NUMBER_NAME[stageLevel]}层`;
}

export function formatRealm(level: number): string {
    return `${realmName(level)}（Lv.${level}）`;
}

