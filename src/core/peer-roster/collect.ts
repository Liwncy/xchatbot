import type {Env} from '../../types/env.js';
import {resolveBotId, resolveOwnerId} from '../bot.js';
import type {IncomingMessage} from '../message.js';
import {assertPeerTargetAllowed, peerSave} from './service.js';
import {scopeFromMessage} from './scope.js';
import {normalizeShoutTemplate} from './template.js';

const PENDING_TTL_SECONDS = 60;
const CHATTY = /[吗呢呀？?]|帮我|请问|能不能|可以吗/u;
const CHAT_WORD = /^(哈哈+|呵呵+|嗯+|好的|哦|行|啊|唉|额|嗯嗯|ok|okay)$/iu;
const COMMAND_TOKEN = /^[a-z][a-z0-9:_-]*$/iu;

export type PeerPending = {
    scope: string;
    wxid: string;
    name: string;
    topic: string;
    template: string;
    mention: boolean;
    platform: string;
};

export function pendingKvKey(platform: string, roomId: string, wxid: string): string {
    return `peer:pending:${platform}:${roomId}:${wxid}`;
}

export function stripLeadAt(text: string): string {
    return text.replace(/^(?:[@＠][^\s@＠]+[\s,，:：]*)+/u, '').trim();
}

export function looksLikePeerShout(raw: string): boolean {
    const text = stripLeadAt(raw);
    if (!text || text.length > 32) return false;
    if (CHATTY.test(text)) return false;
    if (text.includes('::') || text.startsWith('/') || text.startsWith('／')) return true;
    if (CHAT_WORD.test(text)) return false;
    if (/来首|来一[首个张]|给我唱/u.test(text)) return false;
    const token = text.split(/\s+/u, 1)[0] ?? '';
    if (COMMAND_TOKEN.test(token) && !CHAT_WORD.test(token)) return true;
    return !/\s/u.test(text) && text.length >= 2 && text.length <= 16;
}

export function parsePeerShout(raw: string): {topic: string; template: string} | null {
    const text = stripLeadAt(raw);
    if (!looksLikePeerShout(text)) return null;
    const parsed = normalizeShoutTemplate(text);
    const topic = (text.split(/\s+/u, 1)[0] ?? text).trim();
    if (!topic) return null;
    return {topic, template: parsed.template || text};
}

function pickTarget(message: IncomingMessage, env: Env): {wxid: string; name: string} | null {
    const botId = resolveBotId(env, message.platform);
    const ownerId = resolveOwnerId(env, message.platform);
    const other = (message.mentions ?? []).find((item) => {
        const id = item.id.trim();
        if (!id) return false;
        if (botId && id === botId) return false;
        if (ownerId && id === ownerId) return false;
        return true;
    });
    if (!other) return null;
    const blocked = assertPeerTargetAllowed(env, message.platform, other.id, other.name ?? '');
    if (blocked) return null;
    return {wxid: other.id.trim(), name: other.name?.trim() || other.id.trim()};
}

export async function offerPeerPending(env: Env, message: IncomingMessage): Promise<boolean> {
    if (message.source !== 'group') return false;
    const roomId = message.room?.id?.trim() ?? '';
    if (!roomId) return false;
    const target = pickTarget(message, env);
    if (!target) return false;
    const shout = parsePeerShout(message.content ?? '');
    if (!shout) return false;
    const pending: PeerPending = {
        scope: scopeFromMessage(message),
        wxid: target.wxid,
        name: target.name,
        topic: shout.topic,
        template: shout.template,
        mention: true,
        platform: message.platform,
    };
    await env.XBOT_KV.put(
        pendingKvKey(message.platform, roomId, target.wxid),
        JSON.stringify(pending),
        {expirationTtl: PENDING_TTL_SECONDS},
    );
    return true;
}

export async function confirmPeerPending(env: Env, message: IncomingMessage): Promise<boolean> {
    if (message.source !== 'group') return false;
    const roomId = message.room?.id?.trim() ?? '';
    const from = message.from.trim();
    if (!roomId || !from) return false;
    const key = pendingKvKey(message.platform, roomId, from);
    const raw = await env.XBOT_KV.get(key);
    if (!raw?.trim()) return false;
    let pending: PeerPending;
    try {
        pending = JSON.parse(raw) as PeerPending;
    } catch {
        await env.XBOT_KV.delete(key);
        return false;
    }
    const name = message.senderName?.trim() || pending.name;
    await peerSave(env, {
        scope: pending.scope,
        wxid: pending.wxid || from,
        name,
        topic: pending.topic,
        template: pending.template,
        mention: pending.mention,
        platform: pending.platform || message.platform,
    });
    await env.XBOT_KV.delete(key);
    return true;
}

export async function peerCollectInbound(env: Env, message: IncomingMessage): Promise<void> {
    await confirmPeerPending(env, message);
    await offerPeerPending(env, message);
}
