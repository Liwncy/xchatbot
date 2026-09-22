import type {Env} from '../../types/env.js';
import {resolveBotId, resolveOwnerId} from '../bot.js';
import {
    disablePeerRoute,
    listPeerRoutes,
    searchPeerRoutes,
    upsertPeerRoute,
} from './repository.js';
import {normalizeRosterScope} from './scope.js';
import {extractAsk, outboundLine, renderShout} from './template.js';
import type {PeerMatch, PeerRoute, PeerRouteInput} from './types.js';

const SELF_NAMES = new Set(['小聪明儿', '自己', '我']);
const OWNER_NAMES = new Set(['李芈仙', '主人', '芈仙']);

export function peerSearch(
    env: Env,
    input: {scope: string; query?: string; includeInactive?: boolean},
): Promise<PeerRoute[]> {
    return searchPeerRoutes(env.XBOT_DB, input.scope, input.query ?? '', Boolean(input.includeInactive));
}

export function peerList(env: Env, scope: string, includeInactive = false): Promise<PeerRoute[]> {
    return listPeerRoutes(env.XBOT_DB, scope, includeInactive);
}

export async function peerSave(
    env: Env,
    input: PeerRouteInput & {platform?: string},
): Promise<PeerRoute> {
    const name = input.name.trim();
    const topic = input.topic.trim();
    if (!name) throw new Error('人空了');
    if (!topic) throw new Error('会啥空了');
    const blocked = assertPeerTargetAllowed(env, input.platform ?? 'golem', input.wxid ?? '', name);
    if (blocked) throw new Error(blocked);
    return upsertPeerRoute(env.XBOT_DB, {
        ...input,
        name,
        topic,
        fallback: input.fallback || topic === '兜底',
        scope: normalizeRosterScope(input.scope),
    });
}

export async function peerBan(
    env: Env,
    input: {scope: string; id?: number; wxid?: string; topic?: string},
): Promise<PeerRoute | null> {
    return disablePeerRoute(env.XBOT_DB, input.scope, input);
}

function sameText(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** 按 agent 点的会啥/人取行，不拿对方原话做包含匹配。 */
export function pickPeerRoute(
    rows: PeerRoute[],
    pick: {id?: number; topic?: string; name?: string; wxid?: string},
): PeerRoute | undefined {
    if (pick.id != null) {
        return Number.isInteger(pick.id) && pick.id > 0
            ? rows.find((row) => row.id === pick.id)
            : undefined;
    }
    const topic = pick.topic?.trim() ?? '';
    const name = pick.name?.trim() ?? '';
    const wxid = pick.wxid?.trim() ?? '';
    let pool = rows;
    if (wxid) {
        const hit = pool.filter((row) => row.wxid === wxid);
        if (hit.length) pool = hit;
    }
    if (name) {
        const hit = pool.filter((row) => sameText(row.name, name));
        if (hit.length) pool = hit;
    }
    if (topic && topic !== '兜底') {
        const hit = pool.find((row) => sameText(row.topic, topic))
            ?? rows.find((row) => sameText(row.topic, topic));
        if (hit) return hit;
    }
    return pool.find((row) => row.fallback) ?? rows.find((row) => row.fallback);
}

export async function peerMatch(
    env: Env,
    input: {scope: string; query: string; id?: number; topic?: string; name?: string; wxid?: string; platform?: string},
): Promise<PeerMatch> {
    const query = input.query.trim();
    const rows = await listPeerRoutes(env.XBOT_DB, input.scope);
    const picked = pickPeerRoute(rows, input);
    if (!picked) {
        return {ok: false, fallback: false, ask: query, text: '', outbound: '', reply: '不会'};
    }
    const ask = picked.type === 'fixed' ? '' : extractAsk(query, picked.template);
    const rendered = renderShout(picked, picked.type === 'talk' ? (ask || query) : ask);
    if (!rendered.ok) {
        const backup = rows.find((row) => row.fallback && row.id !== picked.id);
        if (backup) {
            const again = renderShout(backup, query);
            if (again.ok) {
                return packMatch(backup, query, again.text, true);
            }
        }
        return {ok: false, fallback: false, ask, route: picked, text: '', outbound: '', reply: '不会'};
    }
    return packMatch(picked, ask || query, rendered.text, Boolean(picked.fallback));
}

function packMatch(route: PeerRoute, ask: string, text: string, fallback: boolean): PeerMatch {
    return {
        ok: true,
        fallback,
        route,
        ask,
        text,
        outbound: route.mention ? (outboundLine(route.wxid, text) || text) : text,
        reply: fallback ? '喊她了' : '喊了',
    };
}

export function assertPeerTargetAllowed(env: Env, platform: string, wxid: string, name: string): string | null {
    const botId = resolveBotId(env, platform);
    const ownerId = resolveOwnerId(env, platform);
    const id = wxid.trim();
    if (id && botId && id === botId) return '这个不能记';
    if (id && ownerId && id === ownerId) return '这个不能记';
    if (SELF_NAMES.has(name.trim()) || OWNER_NAMES.has(name.trim())) return '这个不能记';
    return null;
}

export function formatPeerList(rows: PeerRoute[]): string {
    if (!rows.length) return '这群还没记谁';
    return rows.map((row) => {
        const shout = row.type === 'talk' ? '人话' : row.type === 'fixed' ? '照念' : '带空';
        const at = row.mention ? '@' : '免@';
        const sample = row.template || '人话';
        return `#${row.id} · ${row.name} · ${row.topic} · ${shout}/${at} · ${sample}`;
    }).join('\n');
}
