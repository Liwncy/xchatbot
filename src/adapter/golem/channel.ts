import {resolveChatId} from '../../core/context.js';
import type {ChatRecordReply, ReplyMessage} from '../../core/reply.js';
import type {Env} from '../../types/env.js';
import type {ChannelAdapter, DirectoryPerson, RevokeResult, RoomMember} from '../types.js';
import {buildRevokeParam, GolemApi} from './api.js';
import {emitChatRecordLine} from './chat-record.js';
import {isDirectoryMiss, mapDirectoryPeople} from './directory.js';
import {GOLEM_PLATFORM} from './parse.js';
import {GolemChatroomRoster, isChatroom} from './roster.js';
import {sendGolemReplies} from './send.js';

function golemApi(env: Env): GolemApi | null {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    return apiBaseUrl ? new GolemApi(apiBaseUrl) : null;
}

export const golemAdapter: ChannelAdapter = {
    platform: GOLEM_PLATFORM,

    async send(message, replies, env) {
        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) return [];
        return sendGolemReplies(apiBaseUrl, message, replies, env);
    },

    async revoke(message, env): Promise<RevokeResult> {
        const referMessageId = message.quote?.referMessageId;
        if (!referMessageId?.newId) {
            return {ok: false, reason: 'incomplete'};
        }

        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) return {ok: false, reason: 'unavailable'};

        const param = buildRevokeParam(
            resolveChatId(message),
            referMessageId.clientIdText ?? referMessageId.clientId,
            referMessageId.newIdText ?? referMessageId.newId,
            referMessageId.createTime,
        );
        if (!param) return {ok: false, reason: 'incomplete'};

        const result = await new GolemApi(apiBaseUrl).revokeMessage(param);
        if (result.code !== 0) return {ok: false, reason: 'expired'};
        return {ok: true};
    },

    async searchDirectory(query, env): Promise<DirectoryPerson[]> {
        const api = golemApi(env);
        if (!api) throw new Error('wechat api missing');
        const result = await api.searchContacts({keyword: query});
        if (isDirectoryMiss(result)) return [];
        if (typeof result.code === 'number' && result.code !== 0) {
            throw new Error(`searchContacts code=${result.code} message=${result.message}`);
        }
        return mapDirectoryPeople(result.data);
    },

    async findRoomMember(roomId, name, env): Promise<RoomMember | null> {
        const api = golemApi(env);
        if (!api || !isChatroom(roomId)) return null;
        const member = await new GolemChatroomRoster(api).findByName(roomId, name);
        if (!member) return null;
        return {
            id: member.id,
            name: member.name,
            nickname: member.nickname || undefined,
            avatarUrl: member.avatar || undefined,
        };
    },

    toOutboundText(reply: ReplyMessage): string | null {
        if (reply.type === 'chat-record') return emitChatRecord(reply);
        if (reply.type === 'app') return `app:${reply.appType} ${reply.xml}`;
        return null;
    },
};

function emitChatRecord(reply: ChatRecordReply): string {
    return emitChatRecordLine(reply.items, reply.title, reply.summary, reply.desc);
}
