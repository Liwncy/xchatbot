import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import type {HandlerResponse} from '../types/reply.js';
import {buildHandledReply} from '../types/reply.js';
import {logger} from '../utils/logger.js';
import {getBotWechatId, getBotWechatName} from '../utils/bot.js';
import {getRequestContext} from '../utils/request-context.js';
import {loadDebugForwardConfig} from '../admin/debug.js';
import {
    rememberAiDialogTriggerSideEffects,
    resolveAiDialogChatTrigger,
} from '../plugins/cognitive/ai-dialog/plugin.js';
import {ensureXbotChannelConnected} from './xbot-channel-client.js';
import {forwardInboundToXbotChannel} from './xbot-channel-client.js';
import {mapIncomingMessageToXbotInbound} from './xbot-inbound-mapper.js';
import {resolveOpenClawMedia} from './resolve-media-url.js';
import {resolveXbotChannelConfigState} from './xbot-channel-config.js';

function normalizeBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭', '禁用'].includes(normalized)) return false;
    return fallback;
}

export function isOpenClawAutoForwardEnabled(env: {XBOT_CHANNEL_AUTO_FORWARD?: string}): boolean {
    return normalizeBoolean(env.XBOT_CHANNEL_AUTO_FORWARD, false);
}

/** 引用的是机器人自己发过的消息 */
export function isQuotedBotMessage(message: IncomingMessage, env: Env): boolean {
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

/**
 * 真微信引用消息的用户正文在 quote.title，content 常为空。
 * 转发给 OpenClaw 前补上，便于点名检测与 Agent 读到用户在说啥。
 */
export function withQuoteUserContent(message: IncomingMessage): IncomingMessage {
    if (!message.quote) return message;
    const title = message.quote.title?.trim() ?? '';
    const content = message.content?.trim() ?? '';
    if (content || !title) return message;
    return {...message, content: title};
}

/**
 * 尝试转发到 OpenClaw xbot 频道。
 * 文本插件与 link（真引用）共用，避免引用消息停在 link handler。
 */
export async function tryForwardOpenClawXbot(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    if (!isOpenClawAutoForwardEnabled(env)) return null;

    const normalized = withQuoteUserContent(message);
    const quotedBot = isQuotedBotMessage(normalized, env);
    const trigger = await resolveAiDialogChatTrigger(normalized, env);
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
        const media = await resolveOpenClawMedia(normalized, env);
        // 冒泡未点名要 forceDispatch；引用机器人本身靠 botMentioned（内容含机器人发送者）
        // 引用机器人但检测不到发送者时仍 force，避免只攒历史
        const forceDispatch = quotedBot
            || (!quotedBot && trigger.kind === 'ambient_bubble');
        const payload = mapIncomingMessageToXbotInbound(normalized, env, {
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
        // 引用机器人：确保频道侧按点名处理（即使 referFrom 缺失）
        if (quotedBot) {
            payload.botMentioned = true;
        }
        if (media?.url) {
            logger.info('OpenClaw 入站已附带公网媒体地址', {
                messageId: normalized.messageId,
                type: normalized.type,
                referType: normalized.quote?.referType,
                mediaKind: media.kind,
                mediaUrl: media.url,
                ...(media.videoUrl ? {videoUrl: media.videoUrl} : {}),
            });
        }
        const result = await forwardInboundToXbotChannel(state.config, payload);
        if (result.dispatched === true) {
            await rememberAiDialogTriggerSideEffects(normalized, env, {treatAsDirect: quotedBot});
            if (forceDispatch) {
                logger.info('OpenClaw 已接手（forceDispatch）', {
                    messageId: normalized.messageId,
                    reason: result.reason,
                    sessionKey: result.sessionKey,
                    quotedBot,
                });
            }
            return buildHandledReply();
        }
        if (
            forceDispatch
            && result.accumulated !== true
            && result.reason !== 'history-accumulated'
        ) {
            await rememberAiDialogTriggerSideEffects(normalized, env, {treatAsDirect: quotedBot});
            logger.info('OpenClaw 已接单（无可见回复标记仍阻断本地回落）', {
                messageId: normalized.messageId,
                reason: result.reason,
                sessionKey: result.sessionKey,
            });
            return buildHandledReply();
        }
        if (forceDispatch && result.accumulated === true) {
            logger.warn('OpenClaw forceDispatch 未生效，回退后续插件', {
                messageId: normalized.messageId,
                reason: result.reason,
            });
        } else if (forceDispatch) {
            logger.warn('OpenClaw 未接手，回退后续处理', {
                messageId: normalized.messageId,
                reason: result.reason,
                dispatched: result.dispatched,
                accumulated: result.accumulated,
            });
        }
    } catch (error) {
        logger.warn('OpenClaw xbot 转发失败，回退后续处理', {
            messageId: normalized.messageId,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return null;
}
