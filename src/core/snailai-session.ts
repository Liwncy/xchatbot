/**
 * SnailAI 外部用户与 conversationId。存在 KV，切演法时丢掉 conversation。
 *
 * 群聊整群共用一个 openId / 会话；私聊按人。对齐 one-agent SessionKeys。
 */
import {resolveChatSession} from './chat-log/session.js';
import type {IncomingMessage} from './message.js';
import type {Env} from '../types/env.js';

const ACCOUNT = 'default';

export function snailaiSessionKey(message: IncomingMessage): string {
    const session = resolveChatSession(message);
    const peer = session.sessionType === 'group'
        ? `group:${session.sessionId}`
        : `user:${message.from.trim()}`;
    return `${message.platform}:${ACCOUNT}:${peer}`;
}

export function snailaiExternalId(message: IncomingMessage): string {
    if (message.source === 'group') {
        return `${message.platform}:${ACCOUNT}:group:${message.room?.id?.trim() ?? ''}`;
    }
    return `${message.platform}:${ACCOUNT}:${message.from.trim()}`;
}

export function snailaiNickname(message: IncomingMessage): string {
    if (message.source === 'group') {
        return message.room?.id?.trim() || message.senderName?.trim() || snailaiExternalId(message);
    }
    return message.senderName?.trim() || message.from.trim();
}

function convKey(sessionKey: string): string {
    return `snailai:conv:${sessionKey}`;
}

function openIdKey(externalId: string): string {
    return `snailai:openid:${externalId}`;
}

function subKey(openId: string, agentId: number): string {
    return `snailai:sub:${openId}:${agentId}`;
}

export async function loadCachedOpenId(env: Env, externalId: string): Promise<string | null> {
    const raw = await env.XBOT_KV.get(openIdKey(externalId));
    return raw?.trim() || null;
}

export async function storeOpenId(env: Env, externalId: string, openId: string): Promise<void> {
    await env.XBOT_KV.put(openIdKey(externalId), openId);
}

export async function isSubscribed(env: Env, openId: string, agentId: number): Promise<boolean> {
    const raw = await env.XBOT_KV.get(subKey(openId, agentId));
    return Boolean(raw?.trim());
}

export async function markSubscribed(env: Env, openId: string, agentId: number): Promise<void> {
    await env.XBOT_KV.put(subKey(openId, agentId), '1');
}

export async function resolveConversationId(env: Env, message: IncomingMessage): Promise<string> {
    const key = convKey(snailaiSessionKey(message));
    const existing = (await env.XBOT_KV.get(key))?.trim();
    if (existing) return existing;
    const created = crypto.randomUUID().replaceAll('-', '');
    await env.XBOT_KV.put(key, created);
    return created;
}

export async function resetSnailaiConversation(env: Env, message: IncomingMessage): Promise<void> {
    await env.XBOT_KV.delete(convKey(snailaiSessionKey(message)));
}
