import type {RoomMember} from '../types.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function textOf(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * 从 `/api/contact/detail` 的 data 里找群主。
 * 群主 id 在 `contact_list[0].chatroom_owner`，昵称要回成员列表里按 id 对。
 * 找不到群主，或者成员列表里没有他（拿不到昵称），都返回 null。
 */
export function parseRoomOwner(data: unknown): RoomMember | null {
    const list = asRecord(data)?.contact_list;
    if (!Array.isArray(list)) return null;
    const contact = asRecord(list[0]);
    const ownerId = textOf(contact?.chatroom_owner);
    if (!ownerId) return null;

    const members = asRecord(contact?.members)?.list;
    if (!Array.isArray(members)) return null;
    for (const item of members) {
        const rec = asRecord(item);
        if (textOf(rec?.username) !== ownerId) continue;
        const nickname = textOf(rec?.nickname);
        return nickname ? {id: ownerId, name: nickname, nickname} : null;
    }
    return null;
}
