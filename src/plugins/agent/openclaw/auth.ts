import type {Env} from '../../../types/env.js';

export function authorizeOpenClawRequest(request: Request, env: Env): boolean {
    const expected = env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim() || env.AGENT_BRIDGE_TOKEN?.trim();
    if (!expected) return false;
    const header = request.headers.get('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : '';
    return token === expected;
}
