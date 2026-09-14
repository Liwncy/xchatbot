import type {Env} from '../../../types/env.js';
import {DEFAULT_GROUP_SETTINGS, normalizeSettings, type GroupSettings} from './policy.js';

export function sessionKvKey(platform: string, roomId: string): string {
    return `session:g:${platform}:${roomId}`;
}

function legacyGolemSessionKey(roomId: string): string {
    return `golem:session:g:${roomId}`;
}

export async function isGroupSessionActive(
    env: Env,
    platform: string,
    roomId: string,
): Promise<boolean> {
    const raw = await env.XBOT_KV.get(sessionKvKey(platform, roomId));
    if (raw !== null) return raw === '1';
    if (platform === 'golem') {
        return (await env.XBOT_KV.get(legacyGolemSessionKey(roomId))) === '1';
    }
    return false;
}

export async function setGroupSessionActive(
    env: Env,
    platform: string,
    roomId: string,
    active: boolean,
): Promise<void> {
    await env.XBOT_KV.put(sessionKvKey(platform, roomId), active ? '1' : '0');
}

export function settingsKvKey(platform: string, roomId: string): string {
    return `session:g:${platform}:${roomId}:settings`;
}

export function followKvKey(platform: string, roomId: string, userId: string): string {
    return `session:g:${platform}:${roomId}:follow:${userId.trim()}`;
}

export async function getGroupSettings(
    env: Env,
    platform: string,
    roomId: string,
): Promise<GroupSettings> {
    const raw = await env.XBOT_KV.get(settingsKvKey(platform, roomId));
    if (!raw) return DEFAULT_GROUP_SETTINGS;
    try {
        return normalizeSettings(JSON.parse(raw) as Partial<GroupSettings>);
    } catch {
        return DEFAULT_GROUP_SETTINGS;
    }
}

export async function saveGroupSettings(
    env: Env,
    platform: string,
    roomId: string,
    settings: GroupSettings,
): Promise<void> {
    await env.XBOT_KV.put(settingsKvKey(platform, roomId), JSON.stringify(normalizeSettings(settings)));
}

export async function ensureGroupSettings(
    env: Env,
    platform: string,
    roomId: string,
): Promise<GroupSettings> {
    const raw = await env.XBOT_KV.get(settingsKvKey(platform, roomId));
    if (raw) {
        try {
            return normalizeSettings(JSON.parse(raw) as Partial<GroupSettings>);
        } catch {
            // fall through and rewrite defaults
        }
    }
    await saveGroupSettings(env, platform, roomId, DEFAULT_GROUP_SETTINGS);
    return DEFAULT_GROUP_SETTINGS;
}

export async function isFollowActive(
    env: Env,
    platform: string,
    roomId: string,
    userId: string,
): Promise<boolean> {
    const raw = await env.XBOT_KV.get(followKvKey(platform, roomId, userId));
    if (!raw) return false;
    const until = Number.parseInt(raw, 10);
    if (!Number.isFinite(until)) return false;
    return until > Math.floor(Date.now() / 1000);
}

export async function touchFollowWindow(
    env: Env,
    platform: string,
    roomId: string,
    userId: string,
    seconds: number,
): Promise<void> {
    if (seconds <= 0 || !userId.trim()) return;
    const until = Math.floor(Date.now() / 1000) + seconds;
    await env.XBOT_KV.put(followKvKey(platform, roomId, userId), String(until), {
        expirationTtl: Math.max(60, seconds + 30),
    });
}
