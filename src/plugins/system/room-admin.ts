/**
 * 群聊白名单管理插件。
 *
 * 仅限私聊（私信机器人）使用，命令格式：
 *   加群 <roomId>        — 将群加入白名单
 *   移群 <roomId>        — 从白名单移除群
 *   群列表               — 查看当前白名单
 *
 * roomId 格式示例：12345678@chatroom
 */

import type {TextMessage} from '../types.js';
import {RoomFilter} from './room-filter.js';

const COMMANDS = ['加群', '移群', '群列表'] as const;

function parseCommand(content: string): {cmd: typeof COMMANDS[number]; arg: string} | null {
    const trimmed = content.trim();
    for (const cmd of COMMANDS) {
        if (trimmed === cmd || trimmed.startsWith(cmd + ' ') || trimmed.startsWith(cmd + '\n')) {
            const arg = trimmed.slice(cmd.length).trim();
            return {cmd, arg};
        }
    }
    return null;
}

export const roomAdminPlugin: TextMessage = {
    type: 'text',
    name: 'room-admin',
    description: '群聊白名单管理：加群 / 移群 / 群列表（仅私聊可用）',
    match: (content, message) => {
        // 只在私聊中响应
        if (message?.source !== 'private') return false;
        return parseCommand(content) !== null;
    },
    handle: async (message, env) => {
        const parsed = parseCommand(message.content ?? '');
        if (!parsed) return null;

        const {cmd, arg} = parsed;
        const kv = env.XBOT_KV;

        if (cmd === '群列表') {
            const rooms = await RoomFilter.listRooms(kv);
            if (rooms.length === 0) {
                return {type: 'text', content: '当前白名单为空，机器人不会在任何群中回复。'};
            }
            return {
                type: 'text',
                content: `已允许的群（共 ${rooms.length} 个）：\n${rooms.join('\n')}`,
            };
        }

        if (!arg) {
            return {
                type: 'text',
                content: `请在命令后加上群 ID，例如：${cmd} 12345678@chatroom`,
            };
        }

        if (!arg.endsWith('@chatroom')) {
            return {
                type: 'text',
                content: `群 ID 格式不对，应以 @chatroom 结尾，例如：12345678@chatroom`,
            };
        }

        if (cmd === '加群') {
            await RoomFilter.addRoom(kv, arg);
            return {type: 'text', content: `✅ 已将 ${arg} 加入白名单`};
        }

        if (cmd === '移群') {
            const existed = await RoomFilter.removeRoom(kv, arg);
            return {
                type: 'text',
                content: existed ? `✅ 已将 ${arg} 从白名单移除` : `⚠️ ${arg} 不在白名单中`,
            };
        }

        return null;
    },
};

