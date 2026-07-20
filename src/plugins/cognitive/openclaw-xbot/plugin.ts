import type {TextMessage} from '../../types.js';
import type {Env} from '../../../types/env.js';
import type {IncomingMessage} from '../../../types/message.js';
import {buildHandledReply} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {getBotWechatId, getBotWechatName} from '../../../utils/bot.js';
import {getRequestContext} from '../../../utils/request-context.js';
import {loadDebugForwardConfig} from '../../../admin/debug.js';
import {
    ensureXbotChannelConnected,
    forwardInboundToXbotChannel,
    mapIncomingMessageToXbotInbound,
    resolveXbotChannelConfigState,
} from '../../../openclaw/index.js';
import {shouldUseAiDialogChatTrigger} from '../ai-dialog/plugin.js';

function normalizeBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭', '禁用'].includes(normalized)) return false;
    return fallback;
}

function isOpenClawAutoForwardEnabled(env: {XBOT_CHANNEL_AUTO_FORWARD?: string}): boolean {
    return normalizeBoolean(env.XBOT_CHANNEL_AUTO_FORWARD, false);
}

function isQuotedBotMessage(message: IncomingMessage, env: Env): boolean {
    const quote = message.quote;
    if (!quote) return false;

    const botId = getBotWechatId(env, message).trim();
    const referFrom = quote.referFrom?.trim() ?? '';
    if (botId && referFrom && referFrom === botId) {
        return true;
    }

    const botName = getBotWechatName(env).trim();
    const referSenderName = quote.referSenderName?.trim() ?? '';
    return Boolean(botName && referSenderName && referSenderName === botName);
}

async function handleOpenClawXbot(message: Parameters<TextMessage['handle']>[0], env: Parameters<TextMessage['handle']>[1]) {
    if (!isOpenClawAutoForwardEnabled(env)) return null;
    const shouldHandle = isQuotedBotMessage(message, env) || await shouldUseAiDialogChatTrigger(message, env);
    if (!shouldHandle) return null;

    const state = resolveXbotChannelConfigState(env);
    if (state.state !== 'ready') return null;

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    const requestOrigin = getRequestContext()?.requestOrigin?.trim() ?? '';
    const debugConfig = await loadDebugForwardConfig(env);
    const xchatbotApiBaseUrl = debugConfig.enabled && debugConfig.url.trim()
        ? debugConfig.url.trim()
        : requestOrigin;
    const adminToken = env.ADMIN_TOKEN?.trim() ?? '';
    if (apiBaseUrl) {
        try {
            await ensureXbotChannelConnected(state.config, {
                wechatApiBaseUrl: apiBaseUrl,
                ...(xchatbotApiBaseUrl ? {xchatbotApiBaseUrl} : {}),
                ...(adminToken ? {xchatbotAdminToken: adminToken} : {}),
            });
        } catch (error) {
            logger.warn('OpenClaw xbot.connect 失败，继续尝试插件转发', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    try {
        const payload = mapIncomingMessageToXbotInbound(message, env, {
            wechatApiBaseUrl: apiBaseUrl,
            ...(xchatbotApiBaseUrl ? {xchatbotApiBaseUrl} : {}),
            ...(adminToken ? {xchatbotAdminToken: adminToken} : {}),
        });
        const result = await forwardInboundToXbotChannel(state.config, payload);
        if (result.dispatched === true || result.accumulated === true) {
            return buildHandledReply();
        }
    } catch (error) {
        logger.warn('OpenClaw xbot 插件转发失败，回退后续插件', {
            messageId: message.messageId,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return null;
}

export const openClawXbotPlugin: TextMessage = {
    type: 'text',
    name: 'openclaw-xbot',
    description: 'OpenClaw 微信桥接入口：本地插件未命中时转发到 xbot 频道',
    match: (_content, message) => message.source === 'group' || message.source === 'private',
    handle: handleOpenClawXbot,
};
