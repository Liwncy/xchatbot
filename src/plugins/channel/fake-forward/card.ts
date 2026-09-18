import type {ChannelAdapter, RoomMember} from '../../../adapter/types.js';
import {chatRecordReply, type ChatRecordItem, type ChatRecordReply} from '../../../core/reply.js';
import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import {parseFakeForwardScript} from './script.js';

export interface FakeForwardInput {
    script: string;
    title?: string;
    group?: string;
    platform?: string;
}

export async function buildFakeForwardCard(
    adapter: ChannelAdapter | undefined,
    env: Env,
    input: FakeForwardInput,
): Promise<ChatRecordReply> {
    const lines = parseFakeForwardScript(input.script);
    const group = normalizeGroup(input.group);
    const roles = new Map<string, RoomMember>();
    if (group && adapter?.findRoomMember) {
        for (const line of lines) {
            if (roles.has(line.name)) continue;
            const member = await adapter.findRoomMember(group, line.name, env);
            if (member) roles.set(line.name, member);
        }
    }

    const items: ChatRecordItem[] = lines.map((line) => {
        const member = roles.get(line.name);
        return {
            nickname: member ? displayOf(member) : line.name,
            content: line.content,
            avatarUrl: member?.avatarUrl ?? '',
            timestampMs: line.timestampMs,
        };
    });
    const title = input.title?.trim() || undefined;
    logger.info('伪转发已出卡', {
        title: title ?? '群聊的聊天记录',
        items: items.length,
        group: group || '',
        platform: adapter?.platform ?? '',
        matched: roles.size,
    });
    return chatRecordReply(items, {title});
}

function normalizeGroup(raw: string | undefined): string {
    let group = raw?.trim() ?? '';
    if (group.startsWith('group:')) group = group.slice(6).trim();
    return group;
}

function displayOf(member: RoomMember): string {
    return member.nickname?.trim() || member.name;
}
