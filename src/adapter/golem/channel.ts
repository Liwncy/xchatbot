import type {ChatRecordReply, ReplyMessage} from '../../core/reply.js';
import type {Env} from '../../types/env.js';
import type {ChannelAdapter, DirectoryPerson, HongbaoClaimResult, RevokeResult, RoomMember} from '../types.js';
import {buildRevokeParam, GolemApi} from './api.js';
import {emitChatRecordLine} from './chat-record.js';
import {isDirectoryMiss, mapDirectoryPeople} from './directory.js';
import {GOLEM_PLATFORM} from './parse.js';
import {prepareGolemDistributionMessage, toGolemOutboundReplies} from './outbound.js';
import {GolemChatroomRoster, isChatroom} from './roster.js';
import {sendGolemReplies} from './send.js';

function golemApi(env: Env): GolemApi | null {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    return apiBaseUrl ? new GolemApi(apiBaseUrl) : null;
}

export const golemAdapter: ChannelAdapter = {
    platform: GOLEM_PLATFORM,
    supportsProactiveSend: true,

    async send(message, replies, env, options) {
        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) return [];
        return sendGolemReplies(apiBaseUrl, message, replies, env, options);
    },

    async revoke(message, env): Promise<RevokeResult> {
        const referMessageId = message.quote?.referMessageId;
        if (!referMessageId?.newId) {
            return {ok: false, reason: 'incomplete'};
        }

        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) return {ok: false, reason: 'unavailable'};

        const param = buildRevokeParam(
            message.chatId,
            referMessageId.clientIdText ?? referMessageId.clientId,
            referMessageId.newIdText ?? referMessageId.newId,
            referMessageId.createTime,
        );
        if (!param) return {ok: false, reason: 'incomplete'};

        const result = await new GolemApi(apiBaseUrl).revokeMessage(param);
        if (result.code !== 0) return {ok: false, reason: 'expired'};
        return {ok: true};
    },

    toOutboundReplies(message, env) {
        return toGolemOutboundReplies(message, env);
    },

    prepareForDistribution(message, env, options) {
        return prepareGolemDistributionMessage(message, env, options);
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

    async claimHongbao(nativeUrl, scene, env, sessionUsername): Promise<HongbaoClaimResult> {
        const api = golemApi(env);
        if (!api) return {ok: false, reason: 'unavailable'};
        const result = await api.grabHongbao({
            nativeUrl,
            inWay: scene === 'group' ? 0 : 1,
            sessionUsername: scene === 'group' ? sessionUsername : undefined,
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
    const direct = amountOf(rec.amount ?? rec.rec_amount ?? rec.receive_amount ?? rec.recAmount);
    if (direct != null) return direct;
    const raw = hongbaoText(rec.text);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return amountOf(parsed.amount ?? parsed.rec_amount ?? parsed.receive_amount ?? parsed.recAmount);
    } catch {
        return undefined;
    }
}

function hongbaoText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const rec = value as Record<string, unknown>;
    if (typeof rec.value === 'string') return rec.value;
    if (typeof rec.buffer === 'string') return rec.buffer;
    if (!Array.isArray(rec.data)) return '';
    const bytes = rec.data.filter((item): item is number => typeof item === 'number' && item >= 0 && item <= 255);
    return new TextDecoder().decode(Uint8Array.from(bytes));
}

function amountOf(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    if (typeof value === 'string' && /^\d+$/u.test(value.trim())) return Number(value.trim());
    return undefined;
}
