import {resolveOwnerId} from './bot.js';
import type {IncomingMessage} from './message.js';
import type {Env} from '../types/env.js';
import {parseBool} from '../utils/bool.js';

/** 微信内置号 / 公众号，Golem 常标成私聊。 */
const SYSTEM_WXIDS = new Set([
    'weixin',
    'filehelper',
    'fmessage',
    'medianote',
    'floatbottle',
    'newsapp',
    'officialaccounts',
]);

export function isSystemWxid(wxid: string | undefined): boolean {
    const id = wxid?.trim() ?? '';
    if (!id) return false;
    if (SYSTEM_WXIDS.has(id.toLowerCase())) return true;
    return id.startsWith('gh_');
}

export function isOfficialAccount(message: IncomingMessage): boolean {
    return message.source === 'official' || isSystemWxid(message.from);
}

function parseIdList(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw.split(/[,;\s]+/u).map((item) => item.trim()).filter(Boolean);
}

/** 主人 + `XBOT_DM_ALLOW_FROM`。 */
export function resolveDmAllowFrom(env: Env, platform = 'golem'): string[] {
    const ids = new Set<string>(parseIdList(env.XBOT_DM_ALLOW_FROM));
    const owner = resolveOwnerId(env, platform);
    if (owner) ids.add(owner);
    return [...ids];
}

export function isOfficialAllowed(env: Env): boolean {
    return parseBool(env.XBOT_CHANNEL_ALLOW_OFFICIAL, false);
}

export function resolveDmPolicy(env: Env): 'open' | 'allowlist' | 'disabled' {
    const raw = env.XBOT_DM_POLICY?.trim().toLowerCase() ?? '';
    if (raw === 'open' || raw === 'disabled') return raw;
    return 'allowlist';
}

export function shouldAcceptInbound(
    message: IncomingMessage,
    env: Env,
): {ok: true} | {ok: false; reason: string} {
    if (isOfficialAccount(message) && !isOfficialAllowed(env)) {
        return {ok: false, reason: 'official'};
    }
    if (message.source !== 'private') return {ok: true};

    const policy = resolveDmPolicy(env);
    if (policy === 'open') return {ok: true};
    if (policy === 'disabled') return {ok: false, reason: 'dm-disabled'};

    const allow = resolveDmAllowFrom(env, message.platform);
    if (allow.includes(message.from.trim())) return {ok: true};
    return {ok: false, reason: 'dm-allowlist'};
}
