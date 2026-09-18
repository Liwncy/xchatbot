import {logger} from '../../utils/logger.js';
import {GolemApi} from './api.js';

const TTL_MS = 10 * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;
const INVISIBLE = /[\p{Cf}\s\uFE00-\uFE0F]+/gu;

export interface ChatroomMember {
    id: string;
    name: string;
    nickname: string;
    avatar: string;
}

export interface RosterSnapshot {
    byId: Map<string, ChatroomMember>;
    byName: Map<string, ChatroomMember>;
    fetchedAt: number;
}

const cache = new Map<string, RosterSnapshot>();

export function isChatroom(id: string | undefined): boolean {
    return Boolean(id?.trim().endsWith('@chatroom'));
}

export function normalizeMemberName(value: string | undefined): string {
    if (!value?.trim()) return '';
    return value.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
}

export function parseRosterSnapshot(root: unknown, fetchedAt: number): RosterSnapshot {
    const byId = new Map<string, ChatroomMember>();
    const byName = new Map<string, ChatroomMember>();
    const ambiguous = new Set<string>();
    const list = asRecord(asRecord(asRecord(root)?.data)?.result)?.list;
    if (!Array.isArray(list)) {
        return {byId, byName, fetchedAt};
    }

    for (const item of list) {
        const rec = asRecord(item);
        if (!rec) continue;
        const id = textOf(rec.username);
        if (!id) continue;
        const nickname = textOf(rec.nickname);
        const display = textOf(rec.display_name);
        const avatar = firstHttp(textOf(rec.big_avatar_url), textOf(rec.small_avatar_url));
        const member: ChatroomMember = {
            id,
            name: display || nickname,
            nickname,
            avatar,
        };
        byId.set(id.toLowerCase(), member);
        indexName(byName, ambiguous, member.name, member);
        indexName(byName, ambiguous, member.nickname, member);
    }
    for (const key of ambiguous) {
        byName.delete(key);
    }
    return {byId, byName, fetchedAt};
}

export class GolemChatroomRoster {
    constructor(private readonly api: GolemApi) {}

    async findByName(chatroom: string, name: string): Promise<ChatroomMember | null> {
        if (!isChatroom(chatroom) || !name.trim()) return null;
        const key = normalizeMemberName(name);
        if (!key) return null;
        const cached = await this.load(chatroom, false);
        const hit = cached.byName.get(key);
        if (hit) return hit;
        const refreshed = await this.load(chatroom, true);
        return refreshed.byName.get(key) ?? null;
    }

    private async load(chatroom: string, refresh: boolean): Promise<RosterSnapshot> {
        const key = chatroom.trim();
        const now = Date.now();
        const cached = cache.get(key);
        if (cached) {
            const age = now - cached.fetchedAt;
            if (refresh ? age < MIN_REFRESH_MS : age < TTL_MS) {
                return cached;
            }
        }
        const loaded = await this.fetch(key);
        if (!loaded) return cached ?? emptySnapshot(now);
        cache.set(key, loaded);
        return loaded;
    }

    private async fetch(chatroom: string): Promise<RosterSnapshot | null> {
        try {
            const root = await this.api.getChatroomMembers(chatroom);
            const snapshot = parseRosterSnapshot(root, Date.now());
            logger.info('群花名册已拉取', {
                chatroom,
                members: snapshot.byId.size,
                names: snapshot.byName.size,
            });
            return snapshot;
        } catch (error) {
            logger.warn('群花名册拉取失败', {
                chatroom,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}

function emptySnapshot(fetchedAt: number): RosterSnapshot {
    return {byId: new Map(), byName: new Map(), fetchedAt};
}

function indexName(
    byName: Map<string, ChatroomMember>,
    ambiguous: Set<string>,
    name: string,
    member: ChatroomMember,
): void {
    const key = normalizeMemberName(name);
    if (!key) return;
    const exists = byName.get(key);
    if (!exists) {
        byName.set(key, member);
        return;
    }
    if (exists.id.toLowerCase() !== member.id.toLowerCase()) {
        ambiguous.add(key);
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function textOf(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function firstHttp(...values: string[]): string {
    for (const value of values) {
        const lower = value.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://')) return value;
    }
    return '';
}
