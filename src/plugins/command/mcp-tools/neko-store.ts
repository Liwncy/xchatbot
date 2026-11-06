/**
 * 猫娘在 xchatbot 这边要记的几样东西，全放 XBOT_KV，一个群几条：
 *
 * - `neko:on:<platform>:<chatId>`   开关。值为 `1`，或带当前猫娘的 JSON（口令回包时刷新）
 * - `neko:cfg:<platform>:<chatId>`  这群自己调的概率、冷却，没调就用 env 默认
 * - `neko:cd:<platform>:<chatId>`   猫娘接话冷却，靠 KV 过期自己消失
 *
 * 游戏数据本身在 cf-mcp-tools 的 D1，这里只是缓存和开关，丢了不影响存档。
 */
import type {Env} from '../../../types/env.js';

export interface NekoGroupFlag {
    /** 缓存的当前猫娘。还没刷新过时为空串。 */
    ownerId: string;
    ownerName: string;
}

export interface NekoChimeConfig {
    /** 有人 @ 到猫娘本人时，她出现的概率（百分比）。 */
    mentionPercent: number;
    /** 猫娘本人说话时，她接一句的概率（百分比）。 */
    speakPercent: number;
    /** 两次接话之间至少隔几分钟。0 表示不限。 */
    cooldownMinutes: number;
}

const DEFAULT_CONFIG: NekoChimeConfig = {mentionPercent: 5, speakPercent: 3, cooldownMinutes: 10};
const MAX_COOLDOWN_MINUTES = 24 * 60;
/** Workers KV 的过期时间最短 60 秒。 */
const KV_MIN_TTL_SECONDS = 60;

function groupKey(kind: 'on' | 'cfg' | 'cd', platform: string, chatId: string): string {
    return `neko:${kind}:${platform}:${chatId}`;
}

export function nekoGamePlatform(env: Env): string {
    return env.XIUXIAN_PLATFORM?.trim() || 'agbot';
}

// ── 开关 + 猫娘缓存 ─────────────────────────────────────

/** 没开返回 null。 */
export async function readNekoGroup(env: Env, platform: string, chatId: string): Promise<NekoGroupFlag | null> {
    const raw = await env.XBOT_KV.get(groupKey('on', platform, chatId));
    if (!raw) return null;
    if (raw.startsWith('{')) {
        try {
            const parsed = JSON.parse(raw) as Partial<NekoGroupFlag>;
            return {
                ownerId: typeof parsed.ownerId === 'string' ? parsed.ownerId : '',
                ownerName: typeof parsed.ownerName === 'string' ? parsed.ownerName : '',
            };
        } catch {
            // 坏值当作刚开。
        }
    }
    return {ownerId: '', ownerName: ''};
}

/** 已经开着就别动，免得冲掉缓存的猫娘。 */
export async function enableNeko(env: Env, platform: string, chatId: string): Promise<void> {
    const key = groupKey('on', platform, chatId);
    if (await env.XBOT_KV.get(key)) return;
    await env.XBOT_KV.put(key, '1');
}

export async function disableNeko(env: Env, platform: string, chatId: string): Promise<void> {
    await env.XBOT_KV.delete(groupKey('on', platform, chatId));
}

/** 口令回包带了当前猫娘就刷新缓存。没开的群不写，免得误开。 */
export async function syncNekoOwner(
    env: Env,
    platform: string,
    chatId: string,
    owner: {id: string; name: string},
): Promise<void> {
    const current = await readNekoGroup(env, platform, chatId);
    if (!current) return;
    if (current.ownerId === owner.id && current.ownerName === owner.name) return;
    const next: NekoGroupFlag = {ownerId: owner.id, ownerName: owner.name};
    await env.XBOT_KV.put(groupKey('on', platform, chatId), JSON.stringify(next));
}

/** 游戏里确认没有猫娘了（比如全清），把缓存的猫娘去掉，开关保留。没开的群不动。 */
export async function clearNekoOwner(env: Env, platform: string, chatId: string): Promise<void> {
    const current = await readNekoGroup(env, platform, chatId);
    if (!current?.ownerId) return;
    await env.XBOT_KV.put(groupKey('on', platform, chatId), '1');
}

// ── 概率和冷却配置 ──────────────────────────────────────

function clampNumber(value: unknown, min: number, max: number): number | null {
    const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(num)) return null;
    return Math.min(max, Math.max(min, num));
}

/** env 里的全局默认，没配或配坏了用内置值。 */
export function defaultChimeConfig(env: Env): NekoChimeConfig {
    return {
        mentionPercent: clampNumber(env.NEKO_CHIME_MENTION_PERCENT, 0, 100) ?? DEFAULT_CONFIG.mentionPercent,
        speakPercent: clampNumber(env.NEKO_CHIME_SPEAK_PERCENT, 0, 100) ?? DEFAULT_CONFIG.speakPercent,
        cooldownMinutes: clampNumber(env.NEKO_CHIME_COOLDOWN_MINUTES, 0, MAX_COOLDOWN_MINUTES)
            ?? DEFAULT_CONFIG.cooldownMinutes,
    };
}

async function readOverride(env: Env, platform: string, chatId: string): Promise<Partial<NekoChimeConfig>> {
    const raw = await env.XBOT_KV.get(groupKey('cfg', platform, chatId));
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<NekoChimeConfig> = {};
        const mention = clampNumber(parsed.mentionPercent, 0, 100);
        const speak = clampNumber(parsed.speakPercent, 0, 100);
        const cooldown = clampNumber(parsed.cooldownMinutes, 0, MAX_COOLDOWN_MINUTES);
        if (mention !== null) out.mentionPercent = mention;
        if (speak !== null) out.speakPercent = speak;
        if (cooldown !== null) out.cooldownMinutes = cooldown;
        return out;
    } catch {
        return {};
    }
}

/** 这群生效的配置：env 默认被这群自己调的值盖住。 */
export async function loadChimeConfig(env: Env, platform: string, chatId: string): Promise<NekoChimeConfig> {
    return {...defaultChimeConfig(env), ...await readOverride(env, platform, chatId)};
}

export async function saveChimeOverride(
    env: Env,
    platform: string,
    chatId: string,
    patch: Partial<NekoChimeConfig>,
): Promise<NekoChimeConfig> {
    const merged = {...await readOverride(env, platform, chatId), ...patch};
    await env.XBOT_KV.put(groupKey('cfg', platform, chatId), JSON.stringify(merged));
    return loadChimeConfig(env, platform, chatId);
}

export async function clearChimeOverride(env: Env, platform: string, chatId: string): Promise<NekoChimeConfig> {
    await env.XBOT_KV.delete(groupKey('cfg', platform, chatId));
    return defaultChimeConfig(env);
}

// ── 接话冷却 ────────────────────────────────────────────

export async function isChimeCooling(env: Env, platform: string, chatId: string): Promise<boolean> {
    return Boolean(await env.XBOT_KV.get(groupKey('cd', platform, chatId)));
}

export async function startChimeCooldown(
    env: Env,
    platform: string,
    chatId: string,
    minutes: number,
): Promise<void> {
    if (minutes <= 0) return;
    const ttl = Math.max(KV_MIN_TTL_SECONDS, Math.round(minutes * 60));
    await env.XBOT_KV.put(groupKey('cd', platform, chatId), '1', {expirationTtl: ttl});
}
