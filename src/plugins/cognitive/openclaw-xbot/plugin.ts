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
    resolveOpenClawMedia,
    resolveXbotChannelConfigState,
} from '../../../openclaw/index.js';
import {
    rememberAiDialogTriggerSideEffects,
    resolveAiDialogChatTrigger,
} from '../ai-dialog/plugin.js';

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
    const quotedBot = isQuotedBotMessage(message, env);
    const trigger = await resolveAiDialogChatTrigger(message, env);
    const shouldHandle = quotedBot || trigger.handle;
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
        const media = await resolveOpenClawMedia(message, env);
        // 随机冒泡未点名：必须强制 dispatch，否则 mention 模式只攒历史不回复
        const forceDispatch = !quotedBot && trigger.kind === 'ambient_bubble';
        const payload = mapIncomingMessageToXbotInbound(message, env, {
            wechatApiBaseUrl: apiBaseUrl,
            ...(xchatbotApiBaseUrl ? {xchatbotApiBaseUrl} : {}),
            ...(adminToken ? {xchatbotAdminToken: adminToken} : {}),
            ...(forceDispatch ? {forceDispatch: true} : {}),
            ...(media?.url
                ? {
                    mediaUrl: media.url,
                    mediaKind: media.kind,
                    ...(media.videoUrl ? {videoUrl: media.videoUrl} : {}),
                }
                : {}),
        });
        if (media?.url) {
            logger.info('OpenClaw 入站已附带公网媒体地址', {
                messageId: message.messageId,
                type: message.type,
                referType: message.quote?.referType,
                mediaKind: media.kind,
                mediaUrl: media.url,
                ...(media.videoUrl ? {videoUrl: media.videoUrl} : {}),
            });
        }
        const result = await forwardInboundToXbotChannel(state.config, payload);
        // 只有真正跑了 Agent 才算接手；仅 accumulate 时放行给后续插件，避免冒泡被吞
        if (result.dispatched === true) {
            await rememberAiDialogTriggerSideEffects(message, env, {treatAsDirect: quotedBot});
            return buildHandledReply();
        }
        if (result.accumulated === true && forceDispatch) {
            logger.warn('OpenClaw 冒泡强制 dispatch 未生效，回退后续插件', {
                messageId: message.messageId,
                reason: result.reason,
            });
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
