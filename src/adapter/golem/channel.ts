import {resolveChatId} from '../../core/context.js';
import type {ChannelAdapter, RevokeResult} from '../types.js';
import {buildRevokeParam, GolemApi} from './api.js';
import {GOLEM_PLATFORM} from './parse.js';
import {sendGolemReplies} from './send.js';

export const golemAdapter: ChannelAdapter = {
    platform: GOLEM_PLATFORM,

    async send(message, replies, env) {
        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) return;
        await sendGolemReplies(apiBaseUrl, message, replies, env);
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
};
