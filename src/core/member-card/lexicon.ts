/**
 * 角色卡的固定名单。职业、阵营只能从这里选，名字一律 4 个字，要增删改这一处。
 * 第二项是写给模型看的「什么样的人」，不会出现在卡上。
 */
export interface LexiconItem {
    name: string;
    hint: string;
}

export const CLASSES: LexiconItem[] = [
    {name: '气氛辅助', hint: '带动气氛、爱接话、爱捧场'},
    {name: '点歌诗人', hint: '爱点歌、爱发语音'},
    {name: '抬杠战士', hint: '爱抬杠、爱争论'},
    {name: '潜水刺客', hint: '平时不出声，偶尔冒出来一击'},
    {name: '吃瓜群众', hint: '围观、跟风、爱问怎么了'},
    {name: '答疑法师', hint: '爱解答、给建议、懂行'},
    {name: '劝架牧师', hint: '调解、安慰、说好话'},
    {name: '表情盗贼', hint: '表情包和图发得多'},
    {name: '召唤术士', hint: '常找机器人办事'},
    {name: '搬运学者', hint: '爱分享链接、资料、新闻'},
    {name: '夜行游侠', hint: '深夜才活跃'},
    {name: '话题先锋', hint: '爱开话题、带节奏'},
    {name: '游荡旅人', hint: '看不出明显特点，实在选不出就用它'},
];

export const CAMPS: LexiconItem[] = [
    {name: '深夜守群', hint: '夜里最活跃'},
    {name: '早起鸟群', hint: '一早就上线'},
    {name: '摸鱼大队', hint: '上班时间也在聊'},
    {name: '吃瓜联盟', hint: '爱围观'},
    {name: '表情军团', hint: '以表情包为主'},
    {name: '养生联盟', hint: '聊吃喝、作息、健康'},
    {name: '技术宅群', hint: '聊技术、游戏、数码'},
    {name: '潜水联盟', hint: '很少说话'},
    {name: '热闹公会', hint: '话多、爱凑热闹'},
    {name: '老友同盟', hint: '和几个熟人互动多'},
    {name: '自由散人', hint: '不属于哪一派，实在选不出就用它'},
];

export const FALLBACK_CLASS = '游荡旅人';
export const FALLBACK_CAMP = '自由散人';
/** 模型两次都没起出 6 个字的称号时用。 */
export const FALLBACK_TITLE = '群里的常驻客';

/** 字数规矩，校验和提示词共用。 */
export const LIMITS = {
    title: 6,
    skillName: 4,
    bondName: 4,
    skillText: 15,
    blurb: 40,
    highlight: 20,
    weak: 20,
    role: 30,
    quoteMin: 2,
    quoteMax: 16,
    skills: 3,
    quotes: 2,
} as const;

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

/** 六项星数加总（6–30）定稀有度。 */
export function rarityOf(starSum: number): Rarity {
    if (starSum >= 25) return 'SSR';
    if (starSum >= 19) return 'SR';
    if (starSum >= 13) return 'R';
    return 'N';
}

export function textLength(text: string): number {
    return Array.from(text).length;
}
