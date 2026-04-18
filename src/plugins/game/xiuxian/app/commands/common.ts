import type {EquipmentSlot, XiuxianItemQuality} from '../../core/types/index.js';

export function parsePositiveInt(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
}

export function parseSlot(raw: string | undefined): EquipmentSlot | null {
    if (!raw) return null;
    const key = raw.trim();
    if (key === '武器' || key === '神兵' || key.toLowerCase() === 'weapon') return 'weapon';
    if (key === '护甲' || key.toLowerCase() === 'armor') return 'armor';
    if (key === '灵宝' || key.toLowerCase() === 'accessory') return 'accessory';
    if (key === '法器' || key.toLowerCase() === 'sutra') return 'sutra';
    return null;
}

export function parseTowerRankArgs(raw: string | undefined): {limit?: number; selfOnly?: boolean; scope?: 'all' | 'weekly'} {
    if (!raw) return {};
    const parts = raw
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const out: {limit?: number; selfOnly?: boolean; scope?: 'all' | 'weekly'} = {};
    for (const part of parts) {
        const lower = part.toLowerCase();
        if (part === '我' || lower === 'me') {
            out.selfOnly = true;
            continue;
        }
        if (part === '周榜' || part === '周' || lower === 'weekly') {
            out.scope = 'weekly';
            continue;
        }
        if (part === '总榜' || part === '总' || lower === 'all') {
            out.scope = 'all';
            continue;
        }
        const n = parsePositiveInt(part);
        if (n) out.limit = n;
    }
    return out;
}

export function parseTowerSeasonRankArgs(raw: string | undefined): {limit?: number; selfOnly?: boolean; seasonKey?: string} {
    if (!raw) return {};
    const parts = raw
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const out: {limit?: number; selfOnly?: boolean; seasonKey?: string} = {};
    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const lower = part.toLowerCase();
        if (part === '我' || lower === 'me') {
            out.selfOnly = true;
            continue;
        }
        if (part === '上季' || part === '上个赛季') {
            out.seasonKey = '__prev__';
            continue;
        }
        if (part === '历史') {
            const key = parts[i + 1];
            if (key) {
                out.seasonKey = key.toUpperCase();
                i += 1;
            }
            continue;
        }
        if (/^\d{4}-W\d{2}$/i.test(part)) {
            out.seasonKey = part.toUpperCase();
            continue;
        }
        const n = parsePositiveInt(part);
        if (n) out.limit = n;
    }
    return out;
}

function parseQualityKeyword(raw: string): XiuxianItemQuality | null {
    const key = raw.trim().toLowerCase();
    if (key === '普通' || key === '白' || key === 'common') return 'common';
    if (key === '优秀' || key === '精良' || key === '绿' || key === 'uncommon') return 'uncommon';
    if (key === '稀有' || key === '蓝' || key === 'rare') return 'rare';
    if (key === '史诗' || key === '紫' || key === 'epic') return 'epic';
    if (key === '传说' || key === '金' || key === 'legendary') return 'legendary';
    if (key === '神话' || key === '红' || key === 'mythic') return 'mythic';
    return null;
}

export function parseSellQualityArg(raw: string): {sellQuality?: XiuxianItemQuality; sellQualityMode?: 'exact' | 'at_least' | 'at_most'} | null {
    const plain = raw.trim().replace(/\s+/g, '');
    if (!plain) return null;
    const withPrefix = plain.startsWith('品质') ? plain.slice(2) : plain;
    if (!withPrefix) return null;

    const atLeast = withPrefix.endsWith('以上') || withPrefix.endsWith('及以上');
    const atMost = withPrefix.endsWith('以下') || withPrefix.endsWith('及以下');
    const qualityRaw = atLeast ? withPrefix.replace(/(及)?以上$/, '') : atMost ? withPrefix.replace(/(及)?以下$/, '') : withPrefix;
    const quality = parseQualityKeyword(qualityRaw);
    if (!quality) return null;
    if (atLeast) return {sellQuality: quality, sellQualityMode: 'at_least'};
    if (atMost) return {sellQuality: quality, sellQualityMode: 'at_most'};
    return {sellQuality: quality, sellQualityMode: 'exact'};
}