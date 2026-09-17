import {resolveChatId} from '../../core/context.js';
import {handledReply, type HandlerResponse} from '../../core/reply.js';
import {findRecentPublicMedia, patchInboundMediaPublicUrl} from '../../core/chat-log/index.js';
import {buildInboundContent} from '../../core/inbound.js';
import type {IncomingMessage} from '../../core/message.js';
import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {resolveOpenClawMedia} from './openclaw/resolve-media.js';

export function trimBaseUrl(url: string | undefined): string | undefined {
    const value = url?.trim();
    if (!value) return undefined;
    return value.replace(/\/+$/u, '');
}

export async function forwardXbotInbound(args: {
    message: IncomingMessage;
    env: Env;
    gatewayBaseUrl: string;
    token: string;
    timeoutMs: number;
    extraHeaders?: Record<string, string>;
    logLabel: string;
}): Promise<HandlerResponse> {
    const {message, env, gatewayBaseUrl, token, timeoutMs, extraHeaders, logLabel} = args;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const conversationId = resolveChatId(message);
    let resolved = await resolveOpenClawMedia(message, env);
    if (resolved) {
        await patchInboundMediaPublicUrl(env, message.messageId, {
            publicUrl: resolved.url,
            videoPublicUrl: resolved.videoUrl,
        });
    } else if (!message.media && !message.quote?.media) {
        resolved = await findRecentPublicMedia(env, message);
    }
    const mediaUrl = resolved?.url;
    const mediaKind = resolved?.kind;
    const videoUrl = resolved?.videoUrl;
    const content = await buildInboundContent(message, env, {
        url: mediaUrl,
        videoUrl,
        kind: mediaKind,
    });

    try {
        const response = await fetch(`${gatewayBaseUrl}/api/channels/xbot/inbound`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...extraHeaders,
            },
            body: JSON.stringify({
                accountId: 'Primary',
                messageId: message.messageId,
                source: message.source === 'group' ? 'group' : 'private',
                from: message.from,
                senderName: message.senderName,
                conversationId,
                roomId: message.room?.id,
                platform: message.platform,
                type: message.type,
                content,
                ...(mediaUrl ? {mediaUrl} : {}),
                ...(mediaKind ? {mediaKind} : {}),
                ...(videoUrl ? {videoUrl} : {}),
                timestamp: message.timestamp,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            logger.warn(`${logLabel} inbound 失败`, {status: response.status});
            return null;
        }
        return handledReply();
    } catch (error) {
        logger.warn(`${logLabel} 转发失败`, {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}
