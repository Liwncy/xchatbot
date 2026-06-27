import {KV_AGENT_BRIDGE_SESSION_PREFIX} from '../../../constants/kv.js';
import type {IncomingMessage} from '../../../types/message.js';
import type {AgentBridgeSessionState} from './types.js';

function sessionStorageKey(sessionKey: string): string {
    return `${KV_AGENT_BRIDGE_SESSION_PREFIX}${sessionKey}`;
}

export function buildAgentBridgeSessionKey(message: IncomingMessage): string {
    const from = message.from.trim();
    if (message.source === 'group' && message.room?.id?.trim()) {
        return `${message.room.id.trim()}:${from}`;
    }
    return from;
}

export function buildAgentBridgeUserId(sessionKey: string): string {
    return sessionKey.replace(/[^a-zA-Z0-9:_-]+/gu, '_').slice(0, 128);
}

export async function loadAgentBridgeSession(
    kv: KVNamespace,
    sessionKey: string,
): Promise<AgentBridgeSessionState | null> {
    const raw = await kv.get(sessionStorageKey(sessionKey));
    if (!raw?.trim()) return null;
    try {
        const parsed = JSON.parse(raw) as AgentBridgeSessionState;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function saveAgentBridgeSession(
    kv: KVNamespace,
    sessionKey: string,
    state: AgentBridgeSessionState,
    ttlSec: number,
): Promise<void> {
    await kv.put(sessionStorageKey(sessionKey), JSON.stringify(state), {
        expirationTtl: Math.max(60, ttlSec),
    });
}
