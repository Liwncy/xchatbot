export type GroupRespondMode = 'mention' | 'full' | 'rule' | 'random' | 'smart';

export type GroupSettings = {
    mode: GroupRespondMode;
    followUpSeconds: number;
    replyChancePercent: number;
    userIds: string[];
    keywords: string[];
};

export const DEFAULT_REPLY_CHANCE = 15;

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
    mode: 'mention',
    followUpSeconds: 0,
    replyChancePercent: DEFAULT_REPLY_CHANCE,
    userIds: [],
    keywords: [],
};

export function modeLabel(mode: GroupRespondMode): string {
    switch (mode) {
        case 'mention':
            return '点名';
        case 'full':
            return '全量';
        case 'rule':
            return '规则';
        case 'random':
            return '随机';
        case 'smart':
            return '智能';
    }
}

export function parseMode(raw: string): GroupRespondMode | null {
    const t = raw.trim().toLowerCase();
    switch (t) {
        case 'mention':
        case '点名':
        case '@':
        case '要@':
        case '部分':
        case '点名模式':
            return 'mention';
        case 'full':
        case '全量':
        case '全部':
        case '全都回':
        case 'all':
        case '全量模式':
            return 'full';
        case 'rule':
        case '规则':
        case '限定':
        case '规则模式':
            return 'rule';
        case 'random':
        case '随机':
        case '随机模式':
        case '概率':
            return 'random';
        case 'smart':
        case '智能':
        case '智能模式':
            return 'smart';
        default:
            return null;
    }
}

function asNonNegInt(value: unknown, fallback: number): number {
    if (value == null || value === '') return fallback;
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export function normalizeSettings(raw: Partial<GroupSettings> | null | undefined): GroupSettings {
    const mode = parseMode(String(raw?.mode ?? '')) ?? DEFAULT_GROUP_SETTINGS.mode;
    return {
        mode,
        followUpSeconds: asNonNegInt(raw?.followUpSeconds, DEFAULT_GROUP_SETTINGS.followUpSeconds),
        replyChancePercent: Math.min(100, asNonNegInt(raw?.replyChancePercent, DEFAULT_REPLY_CHANCE)),
        userIds: uniqueTokens(raw?.userIds),
        keywords: uniqueTokens(raw?.keywords),
    };
}

function uniqueTokens(values: string[] | undefined): string[] {
    if (!values?.length) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const token = value.trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        out.push(token);
    }
    return out;
}

export function matchesRuleUser(settings: GroupSettings, userId: string): boolean {
    const id = userId.trim();
    if (!id || settings.userIds.length === 0) return false;
    return settings.userIds.some((allow) => allow.toLowerCase() === id.toLowerCase());
}

export function matchesKeyword(settings: GroupSettings, text: string): boolean {
    if (!text.trim() || settings.keywords.length === 0) return false;
    const body = text.toLowerCase();
    return settings.keywords.some((kw) => kw && body.includes(kw.toLowerCase()));
}

export function followUpApplies(mode: GroupRespondMode): boolean {
    return mode === 'mention' || mode === 'smart' || mode === 'rule' || mode === 'full';
}

export function allowsGroupMessage(settings: GroupSettings, args: {
    mentioned: boolean;
    followActive: boolean;
    listed: boolean;
    chanceHit: boolean;
}): boolean {
    const named = args.mentioned || args.followActive;
    switch (settings.mode) {
        case 'full':
            return true;
        case 'mention':
        case 'rule':
            return named || args.listed;
        case 'random':
            return args.chanceHit || args.listed;
        case 'smart':
            return named || args.chanceHit || args.listed;
    }
}

export function rollChance(percent: number, random = Math.random): boolean {
    return percent > 0 && random() * 100 < percent;
}

export type GroupCommand =
    | {kind: 'enable'}
    | {kind: 'disable'}
    | {kind: 'status'}
    | {kind: 'set-mode'; mode: GroupRespondMode}
    | {kind: 'set-chance'; percent: number}
    | {kind: 'set-follow'; seconds: number}
    | {kind: 'set-users'; userIds: string[]}
    | {kind: 'set-keywords'; keywords: string[]}
    | {kind: 'clear-rule'}
    | {kind: 'unknown-help'};

const ENABLE = new Set(['启用', '开机', '开始', '开', 'on', 'start', 'enable']);
const DISABLE = new Set(['停用', '关机', '停止', '关', '结束', 'off', 'stop', 'disable']);
const STATUS = new Set(['状态', 'status']);

function splitTokens(raw: string): string[] {
    return uniqueTokens(raw.replace(/[,，;；]/gu, ' ').split(/\s+/u));
}

function parseFollowSeconds(raw: string): number | null {
    const t = raw.trim().toLowerCase()
        .replace('秒钟', '')
        .replace('秒', '')
        .replace('s', '')
        .trim();
    if (!t) return null;
    if (t === '关' || t === '关闭' || t === 'off' || t === '0' || t === '停') return 0;
    if (t === '开' || t === 'on') return 60;
    if (!/^\d+$/u.test(t)) return null;
    return Math.max(0, Number.parseInt(t, 10));
}

export function parseGroupCommand(command: string): GroupCommand | null {
    const text = command.trim();
    if (!text) return null;
    const lower = text.toLowerCase();

    if (ENABLE.has(text) || ENABLE.has(lower)) return {kind: 'enable'};
    if (DISABLE.has(text) || DISABLE.has(lower)) return {kind: 'disable'};
    if (STATUS.has(text) || STATUS.has(lower)) return {kind: 'status'};

    if (
        text === '模式'
        || text === '模式帮助'
        || text === '模式说明'
        || text === '跟聊'
        || text === '跟聊帮助'
        || text === '概率'
        || lower === 'help mode'
        || lower === 'mode'
    ) {
        return {kind: 'unknown-help'};
    }

    const chance = /^(?:概率|随机)\s*(\d{1,3})\s*%?$/iu.exec(text);
    if (chance) {
        return {kind: 'set-chance', percent: Math.min(100, Math.max(0, Number.parseInt(chance[1], 10)))};
    }

    const modeLine = /^模式\s*(.+)$/u.exec(text);
    if (modeLine) {
        const arg = modeLine[1].trim();
        if (!arg || arg === '帮助' || arg === '说明' || arg === '?') return {kind: 'unknown-help'};
        const modeChance = /^随机\s*(\d{1,3})\s*%?$/iu.exec(arg);
        if (modeChance) {
            return {kind: 'set-chance', percent: Math.min(100, Math.max(0, Number.parseInt(modeChance[1], 10)))};
        }
        const mode = parseMode(arg);
        return mode ? {kind: 'set-mode', mode} : {kind: 'unknown-help'};
    }

    const shortMode = parseMode(lower);
    if (
        shortMode
        && ['全量模式', '全都回', '点名模式', '要@', '规则模式', '随机模式', '智能模式'].includes(lower)
    ) {
        return {kind: 'set-mode', mode: shortMode};
    }

    const follow = /^跟聊\s*(.+)$/u.exec(text);
    if (follow) {
        const seconds = parseFollowSeconds(follow[1]);
        return seconds == null ? {kind: 'unknown-help'} : {kind: 'set-follow', seconds};
    }
    if (text === '跟聊关' || text === '关闭跟聊' || text === '关掉跟聊') {
        return {kind: 'set-follow', seconds: 0};
    }

    const users = /^规则\s*用户\s+(.+)$/u.exec(text);
    if (users) return {kind: 'set-users', userIds: splitTokens(users[1])};
    const keywords = /^规则\s*关键词\s+(.+)$/u.exec(text);
    if (keywords) return {kind: 'set-keywords', keywords: splitTokens(keywords[1])};
    if (/^规则\s*清空$/u.test(text)) return {kind: 'clear-rule'};

    return null;
}
