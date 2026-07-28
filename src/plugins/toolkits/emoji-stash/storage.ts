import type {Env} from '../../../types/env.js';
import {
    EMOJI_STASH_AUTO_COLLECT_COOLDOWN_SECONDS,
    EMOJI_STASH_AUTO_COOLDOWN_KV_KEY,
    EMOJI_STASH_LIVE_VERIFY_KV_PREFIX,
    EMOJI_STASH_LIVE_VERIFY_TTL_SECONDS,
    EMOJI_STASH_PENDING_KV_PREFIX,
    EMOJI_STASH_PENDING_TTL_SECONDS,
} from './constants.js';
import type {EmojiStashLiveVerify, EmojiStashPending} from './types.js';

export function buildEmojiStashPendingKey(sessionKey: string): string {
    return `${EMOJI_STASH_PENDING_KV_PREFIX}${sessionKey}`;
}

export function buildEmojiStashLiveVerifyKey(roomId: string): string {
    return `${EMOJI_STASH_LIVE_VERIFY_KV_PREFIX}${roomId}`;
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

export async function getEmojiStashLiveVerify(
    env: Env,
    roomId: string,
): Promise<EmojiStashLiveVerify | null> {
    const raw = await env.XBOT_KV.get(buildEmojiStashLiveVerifyKey(roomId));
    if (!raw?.trim()) return null;
    try {
        return JSON.parse(raw) as EmojiStashLiveVerify;
    } catch {
        return null;
    }
}

export async function putEmojiStashLiveVerify(
    env: Env,
    state: EmojiStashLiveVerify,
): Promise<void> {
    await env.XBOT_KV.put(
        buildEmojiStashLiveVerifyKey(state.roomId),
        JSON.stringify(state),
        {expirationTtl: EMOJI_STASH_LIVE_VERIFY_TTL_SECONDS},
    );
}

export async function deleteEmojiStashLiveVerify(env: Env, roomId: string): Promise<void> {
    await env.XBOT_KV.delete(buildEmojiStashLiveVerifyKey(roomId));
}

/** 清除所有群的持续验证标志。 */
export async function deleteAllEmojiStashLiveVerify(env: Env): Promise<void> {
    let cursor: string | undefined;
    do {
        const page = await env.XBOT_KV.list({
            prefix: EMOJI_STASH_LIVE_VERIFY_KV_PREFIX,
            ...(cursor ? {cursor} : {}),
        });
        await Promise.all(page.keys.map((key) => env.XBOT_KV.delete(key.name)));
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
}
