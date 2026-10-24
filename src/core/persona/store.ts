import type {Env} from '../../types/env.js';
import {resolveChatSession} from '../chat-log/session.js';
import type {IncomingMessage} from '../message.js';

const LEGACY_BIND_PREFIX = 'roleplay:bind:';

export function personaBindKey(platform: string, sessionId: string): string {
    return `persona:bind:${platform}:${sessionId}`;
}

function legacyBindKey(platform: string, sessionId: string): string {
    return `${LEGACY_BIND_PREFIX}${platform}:${sessionId}`;
}

function sessionIdOf(message: IncomingMessage): string {
    return resolveChatSession(message).sessionId;
}

export async function getBoundRoleKey(
    env: Env,
    message: IncomingMessage,
): Promise<string | null> {
    const platform = message.platform;
    const sessionId = sessionIdOf(message);
    const nextKey = personaBindKey(platform, sessionId);
    const current = (await env.XBOT_KV.get(nextKey))?.trim() ?? '';
    if (current) return current;
    const legacyKey = legacyBindKey(platform, sessionId);
    const legacy = (await env.XBOT_KV.get(legacyKey))?.trim() ?? '';
    if (!legacy) return null;
    await env.XBOT_KV.put(nextKey, legacy);
    await env.XBOT_KV.delete(legacyKey);
    return legacy;
}

export async function setBoundRoleKey(
    env: Env,
    message: IncomingMessage,
    roleKey: string,
): Promise<void> {
    const platform = message.platform;
    const sessionId = sessionIdOf(message);
    await env.XBOT_KV.put(personaBindKey(platform, sessionId), roleKey);
    await env.XBOT_KV.delete(legacyBindKey(platform, sessionId));
}

export async function clearBoundRoleKey(env: Env, message: IncomingMessage): Promise<void> {
    const platform = message.platform;
    const sessionId = sessionIdOf(message);
    await env.XBOT_KV.delete(personaBindKey(platform, sessionId));
    await env.XBOT_KV.delete(legacyBindKey(platform, sessionId));
}
