/**
 * 群聊白名单工具。
 *
 * KV key: bot:allowed-rooms
 * value: JSON 数组，元素为 chatroom ID 字符串，例如 ["123@chatroom","456@chatroom"]
 *
 * 白名单为空时视为"未启用过滤"——机器人在所有群中均响应。
 * 白名单非空时，只有列表中的群才会收到机器人回复。
 */

export const KV_ALLOWED_ROOMS = 'bot:allowed-rooms';

export class RoomFilter {
    /** 读取白名单列表（不存在时返回空数组）。 */
    static async listRooms(kv: KVNamespace): Promise<string[]> {
        const raw = await kv.get(KV_ALLOWED_ROOMS);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
        } catch {
            return [];
        }
    }

    /**
     * 判断某个群是否被允许。
     *
     * 规则：
     * - 白名单为空 → 允许（未启用过滤）
     * - 白名单非空 → 仅列表中的群允许
     */
    static async isAllowed(kv: KVNamespace, roomId: string): Promise<boolean> {
        const rooms = await listRoomsCached(kv);
        if (rooms.length === 0) return true;
        return rooms.includes(roomId);
    }

    /** 添加群到白名单（幂等）。 */
    static async addRoom(kv: KVNamespace, roomId: string): Promise<void> {
        const rooms = await RoomFilter.listRooms(kv);
        if (!rooms.includes(roomId)) {
            rooms.push(roomId);
            await kv.put(KV_ALLOWED_ROOMS, JSON.stringify(rooms));
            _cache = null; // 清缓存
        }
    }

    /** 从白名单移除群，返回是否存在。 */
    static async removeRoom(kv: KVNamespace, roomId: string): Promise<boolean> {
        const rooms = await RoomFilter.listRooms(kv);
        const idx = rooms.indexOf(roomId);
        if (idx === -1) return false;
        rooms.splice(idx, 1);
        await kv.put(KV_ALLOWED_ROOMS, JSON.stringify(rooms));
        _cache = null; // 清缓存
        return true;
    }
}

// ── 请求级 in-memory 缓存（避免同一请求内多次读 KV） ──────────────────────────
let _cache: string[] | null = null;

async function listRoomsCached(kv: KVNamespace): Promise<string[]> {
    if (_cache !== null) return _cache;
    _cache = await RoomFilter.listRooms(kv);
    return _cache;
}

