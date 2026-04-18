import type {PrefixSetConfig} from './models.js';

const DEFAULT_PREFIX_SET_CONFIG: PrefixSetConfig[] = [
    {
        prefix: '焚天',
        setKey: 'fentian',
        setName: '焚天套',
        single: {attack: 14, crit: 0.006},
        bonus2: {attack: 24, crit: 0.01},
        bonus4: {attack: 36, attackPct: 0.08, crit: 0.012},
    },
    {
        prefix: '赤霄',
        setKey: 'chixiao',
        setName: '赤霄套',
        single: {attack: 8, defense: 8},
        bonus2: {attack: 14, defense: 14, maxHp: 120},
        bonus4: {attack: 22, defense: 22, maxHp: 220, defensePct: 0.06},
    },
    {
        prefix: '红莲',
        setKey: 'honglian',
        setName: '红莲套',
        single: {maxHp: 90, crit: 0.004},
        bonus2: {maxHp: 180, defense: 10},
        bonus4: {maxHp: 320, maxHpPct: 0.08, crit: 0.012},
    },
    {
        prefix: '神凰',
        setKey: 'shenhuang',
        setName: '神凰套',
        single: {dodge: 0.004, crit: 0.004},
        bonus2: {dodge: 0.008, crit: 0.008, attack: 10},
        bonus4: {dodge: 0.012, crit: 0.012, attack: 18, critPct: 0.06},
    },
];

let activePrefixSetConfig: PrefixSetConfig[] = DEFAULT_PREFIX_SET_CONFIG;
let prefixSetConfigByPrefix = new Map(activePrefixSetConfig.map((cfg) => [cfg.prefix, cfg]));
let prefixSetConfigByKey = new Map(activePrefixSetConfig.map((cfg) => [cfg.setKey, cfg]));

function rebuildPrefixSetIndexes(configs: PrefixSetConfig[]): void {
    prefixSetConfigByPrefix = new Map(configs.map((cfg) => [cfg.prefix, cfg]));
    prefixSetConfigByKey = new Map(configs.map((cfg) => [cfg.setKey, cfg]));
}

function normalizePrefixSetConfig(raw: PrefixSetConfig[]): PrefixSetConfig[] {
    return raw
        .map((cfg) => ({
            prefix: String(cfg.prefix ?? '').trim(),
            setKey: String(cfg.setKey ?? '').trim(),
            setName: String(cfg.setName ?? '').trim(),
            single: cfg.single,
            bonus2: cfg.bonus2,
            bonus4: cfg.bonus4,
        }))
        .filter((cfg) => cfg.prefix && cfg.setKey && cfg.setName);
}

export function getDefaultPrefixSetConfig(): PrefixSetConfig[] {
    return DEFAULT_PREFIX_SET_CONFIG.map((cfg) => ({...cfg}));
}

export function setPrefixSetConfig(configs: PrefixSetConfig[] | null | undefined): void {
    const normalized = normalizePrefixSetConfig(configs ?? []);
    if (!normalized.length) {
        activePrefixSetConfig = DEFAULT_PREFIX_SET_CONFIG;
        rebuildPrefixSetIndexes(activePrefixSetConfig);
        return;
    }
    activePrefixSetConfig = normalized;
    rebuildPrefixSetIndexes(activePrefixSetConfig);
}

export function findPrefixSetByPrefix(prefix: string): PrefixSetConfig | undefined {
    return prefixSetConfigByPrefix.get(prefix);
}

export function findPrefixSetByKey(setKey: string): PrefixSetConfig | undefined {
    return prefixSetConfigByKey.get(setKey);
}