import type {Env} from '../../../types/env.js';

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
