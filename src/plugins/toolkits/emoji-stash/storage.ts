import type {Env} from '../../../types/env.js';
import {
    EMOJI_STASH_AUTO_COLLECT_COOLDOWN_SECONDS,
    EMOJI_STASH_AUTO_COOLDOWN_KV_KEY,
    EMOJI_STASH_PENDING_KV_PREFIX,
    EMOJI_STASH_PENDING_TTL_SECONDS,
    EMOJI_STASH_SHARED_KV_KEY,
} from './constants.js';
import {normalizeEmojiStashCategory} from './categories.js';
import type {EmojiStashPending, StoredEmoji} from './types.js';

export function buildEmojiStashPendingKey(sessionKey: string): string {
    return `${EMOJI_STASH_PENDING_KV_PREFIX}${sessionKey}`;
}

export async function isEmojiStashAutoCollectOnCooldown(env: Env): Promise<boolean> {
    const raw = await env.XBOT_KV.get(EMOJI_STASH_AUTO_COOLDOWN_KV_KEY);
    return Boolean(raw?.trim());
}

export async function markEmojiStashAutoCollectCooldown(env: Env): Promise<void> {
    await env.XBOT_KV.put(
        EMOJI_STASH_AUTO_COOLDOWN_KV_KEY,
        String(Date.now()),
        {expirationTtl: EMOJI_STASH_AUTO_COLLECT_COOLDOWN_SECONDS},
    );
}

export function buildEmojiStashSessionKey(message: {from: string; room?: {id: string}}): string {
    return message.room?.id ? `${message.room.id}:${message.from}` : message.from;
}

function normalizeStoredEmoji(raw: StoredEmoji): StoredEmoji {
    return {
        ...raw,
        name: raw.name.trim().toLowerCase(),
        category: normalizeEmojiStashCategory(raw.category ?? 'misc'),
        tags: Array.isArray(raw.tags)
            ? raw.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
            : [],
    };
}

export async function listStoredEmojis(env: Env): Promise<StoredEmoji[]> {
    const raw = await env.XBOT_KV.get(EMOJI_STASH_SHARED_KV_KEY);
    if (!raw?.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as StoredEmoji[];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeStoredEmoji);
    } catch {
        return [];
    }
}

export async function saveStoredEmojis(env: Env, emojis: StoredEmoji[]): Promise<void> {
    await env.XBOT_KV.put(EMOJI_STASH_SHARED_KV_KEY, JSON.stringify(emojis));
}

export async function getEmojiStashPending(env: Env, sessionKey: string): Promise<EmojiStashPending | null> {
    const raw = await env.XBOT_KV.get(buildEmojiStashPendingKey(sessionKey));
    if (!raw?.trim()) return null;
    try {
        return JSON.parse(raw) as EmojiStashPending;
    } catch {
        return null;
    }
}

export async function putEmojiStashPending(env: Env, pending: EmojiStashPending): Promise<void> {
    await env.XBOT_KV.put(
        buildEmojiStashPendingKey(pending.sessionKey),
        JSON.stringify(pending),
        {expirationTtl: EMOJI_STASH_PENDING_TTL_SECONDS},
    );
}

export async function deleteEmojiStashPending(env: Env, sessionKey: string): Promise<void> {
    await env.XBOT_KV.delete(buildEmojiStashPendingKey(sessionKey));
}
