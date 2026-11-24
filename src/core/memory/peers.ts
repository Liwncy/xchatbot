import type {Env} from '../../types/env.js';
import {assertPeerTargetAllowed} from '../peer-roster/service.js';
import {normalizeShoutTemplate} from '../peer-roster/template.js';
import type {PeerShoutType} from '../peer-roster/types.js';

/** 模型交回来的「谁会办什么事」，已经按能不能记筛过一遍。 */
export interface PeerCandidate {
    wxid: string;
    name: string;
    /** 会啥，几个字：点歌、写脚本。 */
    topic: string;
    /** 别人叫他办时说的原话，没有就是空，空就是人话。 */
    shout: string;
    /** 以下三项由 normalizeShoutTemplate 算，不是模型编的。 */
    type: PeerShoutType;
    template: string;
    example: string;
}

const TOPIC_MAX = 12;
const SHOUT_MAX = 40;
const PEER_CAP = 6;

/** 接在整理提示词后面。试跑时才带上，没放开写入之前线上的提示词不变。 */
export const PEER_RULES = [
    '另外在 JSON 里加一个 peers 数组：{"peers":[{"id":"发言人id","topic":"会啥","shout":"原话"}]}。',
    'peers 记的是「这个群里谁会办哪类事」，以后有人想办这类事时可以把活甩给他。',
    '只收有证据的：有人 @ 他或明说找他办某类事，他随后应了或办了；或者他自己说「我会……」而且有人用过。随口一提、玩梗、演戏、斗嘴都不收。',
    'topic 是几个字的事由，比如点歌、写脚本、查天气。shout 是别人叫他办时说的口令式原话，比如 music 老鼠爱大米；原话不是口令、只是聊天句子，shout 就留空。',
    '身份是 bot 的行不要收。没有就给空数组，宁缺毋滥，一次最多 6 个。peers 只能使用「peers 可选的发言人 id」里的 id。',
].join('\n');

export function describePeerIds(rows: Array<{senderId: string; senderName: string; actorType: string}>): string {
    const names = new Map<string, string>();
    for (const row of rows) {
        const id = row.senderId.trim();
        if (!id || id === 'unknown' || row.actorType === 'bot') continue;
        const name = row.senderName.replace(/\s+/gu, ' ').trim();
        if (!names.has(id) || name) names.set(id, name || names.get(id) || '');
    }
    return [...names.entries()].map(([id, name]) => (name ? `${id}（${name}）` : id)).join('、');
}

export function peerIdSet(rows: Array<{senderId: string; actorType: string}>): Set<string> {
    const ids = new Set<string>();
    for (const row of rows) {
        const id = row.senderId.trim();
        if (id && id !== 'unknown' && row.actorType !== 'bot') ids.add(id);
    }
    return ids;
}

function text(value: unknown, max: number): string {
    return typeof value === 'string'
        ? Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, max).join('')
        : '';
}

/**
 * 模型只说谁、会啥、原话。能不能记（机器人自己、主人）和怎么喊（照念还是带空）都由代码定。
 * 同一个人同一件事只留第一条。
 */
export function parseModelPeers(
    env: Env,
    platform: string,
    raw: Record<string, unknown>,
    allowedIds: ReadonlySet<string>,
    names: ReadonlyMap<string, string>,
): PeerCandidate[] {
    if (!Array.isArray(raw.peers)) return [];
    const seen = new Set<string>();
    const out: PeerCandidate[] = [];
    for (const entry of raw.peers) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const item = entry as Record<string, unknown>;
        const wxid = text(item.id, 80);
        const topic = text(item.topic, TOPIC_MAX);
        if (!wxid || !topic || !allowedIds.has(wxid)) continue;
        const name = names.get(wxid) ?? '';
        if (assertPeerTargetAllowed(env, platform, wxid, name)) continue;
        const key = `${wxid}\n${topic.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const shout = text(item.shout, SHOUT_MAX);
        const parsed = normalizeShoutTemplate(shout);
        out.push({wxid, name, topic, shout, ...parsed});
        if (out.length >= PEER_CAP) break;
    }
    return out;
}
