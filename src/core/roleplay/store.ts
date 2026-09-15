import type {Env} from '../../types/env.js';
import {resolveChatSession} from '../chat-log/session.js';
import type {IncomingMessage} from '../message.js';

export function roleplayBindKey(platform: string, sessionId: string): string {
    return `roleplay:bind:${platform}:${sessionId}`;
}

export function roleplaySessionId(message: IncomingMessage): string {
    return resolveChatSession(message).sessionId;
}

export async function getBoundRoleKey(
    env: Env,
    message: IncomingMessage,
): Promise<string | null> {
    const raw = await env.XBOT_KV.get(roleplayBindKey(message.platform, roleplaySessionId(message)));
    const key = raw?.trim() ?? '';
    return key || null;
}

export async function setBoundRoleKey(
    env: Env,
    message: IncomingMessage,
    roleKey: string,
): Promise<void> {
    await env.XBOT_KV.put(roleplayBindKey(message.platform, roleplaySessionId(message)), roleKey);
}

export async function clearBoundRoleKey(env: Env, message: IncomingMessage): Promise<void> {
    await env.XBOT_KV.delete(roleplayBindKey(message.platform, roleplaySessionId(message)));
}
