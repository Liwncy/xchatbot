import type {Env} from '../../types/env.js';
import {resolveBotId, resolveOwnerId} from '../bot.js';
import {loadAutoScopes} from './auto-scope.js';
import {
    disablePeerRoute,
    listPeerRoutes,
    searchPeerRoutes,
    upsertPeerRoute,
} from './repository.js';
import {normalizeRosterScope} from './scope.js';
import {extractAsk, outboundLine, renderShout} from './template.js';
import {FALLBACK_TITLE, type PeerMatch, type PeerRoute, type PeerRouteInput} from './types.js';

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
    let title = input.title.trim();
    let about = input.about?.trim() ?? '';
    if (!name) throw new Error('人空了');
    if (!title) throw new Error('会啥空了');
    const blocked = assertPeerTargetAllowed(env, input.platform ?? 'golem', input.wxid ?? '', name);
    if (blocked) throw new Error(blocked);
    // 线路名和自动收的范围表里某一项写法一致（不分大小写）时，用表里的写法和说明，
    // 这样手动记的「点歌」和自动收的「点歌」是同一件事，不会一边叫「放歌」一边叫「点歌」
    const scope = (await loadAutoScopes(env)).find((entry) => sameText(entry.title, title));
    if (scope) {
        title = scope.title;
        about = about || scope.about;
    }
    return upsertPeerRoute(env.XBOT_DB, {
        ...input,
        name,
        title,
        about,
        scope: normalizeRosterScope(input.scope),
    });
}

export async function peerBan(
    env: Env,
    input: {scope: string; id?: number; wxid?: string; title?: string},
): Promise<PeerRoute | null> {
    return disablePeerRoute(env.XBOT_DB, input.scope, input);
}

function sameText(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isFallback(row: PeerRoute): boolean {
    return row.title === FALLBACK_TITLE;
}

/** 按 agent 点的线路名/人取行，不拿对方原话做包含匹配。 */
export function pickPeerRoute(
    rows: PeerRoute[],
    pick: {id?: number; title?: string; name?: string; wxid?: string},
): PeerRoute | undefined {
    if (pick.id != null) {
        return Number.isInteger(pick.id) && pick.id > 0
            ? rows.find((row) => row.id === pick.id)
            : undefined;
    }
    const title = pick.title?.trim() ?? '';
    const name = pick.name?.trim() ?? '';
    const wxid = pick.wxid?.trim() ?? '';
    let pool = rows;
    if (wxid) {
        const hit = pool.filter((row) => row.memberId === wxid);
        if (hit.length) pool = hit;
    }
    if (name) {
        const hit = pool.filter((row) => sameText(row.memberName, name));
        if (hit.length) pool = hit;
    }
    if (title && title !== FALLBACK_TITLE) {
        const hit = pool.find((row) => sameText(row.title, title))
            ?? rows.find((row) => sameText(row.title, title));
        if (hit) return hit;
    }
    return pool.find(isFallback) ?? rows.find(isFallback);
}

export async function peerMatch(
    env: Env,
    input: {scope: string; query: string; id?: number; title?: string; name?: string; wxid?: string; platform?: string},
): Promise<PeerMatch> {
    const query = input.query.trim();
    const rows = await listPeerRoutes(env.XBOT_DB, input.scope);
    const picked = pickPeerRoute(rows, input);
    if (!picked) {
        return {ok: false, fallback: false, ask: query, text: '', outbound: '', reply: '不会'};
    }
    const ask = picked.type === 'fixed' ? '' : extractAsk(query, picked.template);
    const rendered = renderShout(
        {type: picked.type, template: picked.template, mention: picked.mention, name: picked.memberName},
        picked.type === 'chat' ? (ask || query) : ask,
    );
    if (!rendered.ok) {
        const backup = rows.find((row) => isFallback(row) && row.id !== picked.id);
        if (backup) {
            const again = renderShout(
                {type: backup.type, template: backup.template, mention: backup.mention, name: backup.memberName},
                query,
            );
            if (again.ok) {
                return packMatch(backup, query, again.text, true);
            }
        }
        return {ok: false, fallback: false, ask, route: picked, text: '', outbound: '', reply: '不会'};
    }
    return packMatch(picked, ask || query, rendered.text, isFallback(picked));
}

function packMatch(route: PeerRoute, ask: string, text: string, fallback: boolean): PeerMatch {
    const outbound = route.mention ? (outboundLine(route.memberId, text) || text) : text;
    return {
        ok: true,
        fallback,
        route,
        ask,
        text,
        outbound,
        reply: outbound || text || '不会',
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
        const shout = row.type === 'chat' ? '人话' : row.type === 'fixed' ? '照念' : '带空';
        const at = row.mention ? '@' : '免@';
        const sample = row.template || '人话';
        const about = row.about && row.about !== row.title ? ` · ${row.about}` : '';
        return `#${row.id} · ${row.title} · ${row.memberName} · ${shout}/${at} · ${sample}${about}`;
    }).join('\n');
}
