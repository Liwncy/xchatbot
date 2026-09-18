import {resolveChatId} from '../../core/context.js';
import type {ChatRecordReply, ReplyMessage} from '../../core/reply.js';
import type {Env} from '../../types/env.js';
import type {ChannelAdapter, DirectoryPerson, HongbaoClaimResult, RevokeResult, RoomMember} from '../types.js';
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

    async claimHongbao(nativeUrl, scene, env): Promise<HongbaoClaimResult> {
        const api = golemApi(env);
        if (!api) return {ok: false, reason: 'unavailable'};
        const result = await api.grabHongbao({
            nativeUrl,
            inWay: scene === 'group' ? 0 : 1,
        });
        if (result.code !== 0) return {ok: false, reason: 'failed'};
        return {ok: true, amountFen: pickHongbaoAmount(result.data)};
    },
};

function emitChatRecord(reply: ChatRecordReply): string {
    return emitChatRecordLine(reply.items, reply.title, reply.summary, reply.desc);
}

function pickHongbaoAmount(data: unknown): number | undefined {
    const rec = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : undefined;
    if (!rec) return undefined;
    const direct = rec.amount ?? rec.rec_amount ?? rec.receive_amount ?? rec.recAmount;
    if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return Math.floor(direct);
    if (typeof direct === 'string' && /^\d+$/u.test(direct.trim())) return Number(direct.trim());

    const text = rec.text;
    const raw = typeof text === 'string'
        ? text
        : text && typeof text === 'object' && !Array.isArray(text) && typeof (text as {buffer?: unknown}).buffer === 'string'
            ? (text as {buffer: string}).buffer
            : '';
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const amount = parsed.amount ?? parsed.rec_amount ?? parsed.receive_amount ?? parsed.recAmount;
        if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) return Math.floor(amount);
        if (typeof amount === 'string' && /^\d+$/u.test(amount.trim())) return Number(amount.trim());
    } catch {
        return undefined;
    }
    return undefined;
}
