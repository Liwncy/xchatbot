import type {IncomingMessage} from '../../../core/message.js';
import {resolveBotId, resolveBotName, resolveOwnerId} from '../../../core/bot.js';
import type {Env} from '../../../types/env.js';
import {resolveChatId} from '../../../core/context.js';
import {handledReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import {findRecentPublicMedia, patchInboundMediaPublicUrl} from '../../../core/chat-log/index.js';
import {resolveOpenClawMedia, resolveOpenClawMediaKind} from './resolve-media.js';

function resolveGatewayBaseUrl(env: {
    XBOT_CHANNEL_GATEWAY_URL?: string;
    AGENT_BRIDGE_BASE_URL?: string;
}): string | undefined {
    const explicit = env.XBOT_CHANNEL_GATEWAY_URL?.trim();
    if (explicit) return explicit.replace(/\/+$/u, '');
    const bridge = env.AGENT_BRIDGE_BASE_URL?.trim().replace(/\/+$/u, '');
    if (!bridge) return undefined;
    return bridge.endsWith('/v1') ? bridge.slice(0, -3) : bridge;
}

function isHttpUrl(value: string | undefined): value is string {
    return Boolean(value?.trim() && /^https?:\/\//iu.test(value.trim()));
}

function mediaAddressLabel(kind: ReturnType<typeof resolveOpenClawMediaKind>): string {
    if (kind === 'emoji') return '表情地址';
    if (kind === 'video') return '视频地址';
    return '图片地址';
}

function buildSpeakerPrefix(message: IncomingMessage, env: Env): string {
    const ownerId = resolveOwnerId(env, message.platform);
    const isOwner = Boolean(ownerId && message.from.trim() === ownerId);
    const nick = message.senderName?.trim() ?? '';
    const speaker = message.source === 'group' && nick && nick !== message.from
        ? `${message.from}/${nick}`
        : message.from;
    const scope = message.source === 'group'
        ? `group:${message.room?.id ?? ''}`
        : `user:${message.from}`;
    return `[${speaker}${isOwner ? ' owner' : ''} scope=${scope}]`;
}

function buildOpenClawContent(
    message: IncomingMessage,
    env: Env,
    mediaUrl?: string,
    videoUrl?: string,
    mediaKind?: ReturnType<typeof resolveOpenClawMediaKind>,
): string {
    const userText = message.content?.trim() || message.quote?.title?.trim() || '';
    const media = message.media ?? message.quote?.media;
    const kind = mediaKind ?? resolveOpenClawMediaKind(message);
    const lines: string[] = [];
    if (isHttpUrl(mediaUrl)) lines.push(`${mediaAddressLabel(kind)}: ${mediaUrl.trim()}`);
    if (isHttpUrl(videoUrl) && videoUrl.trim() !== mediaUrl?.trim()) {
        lines.push(`视频地址: ${videoUrl.trim()}`);
    }
    if (media?.md5?.trim()) lines.push(`MD5: ${media.md5.trim()}`);
    const body = lines.length
        ? (userText ? [userText, ...lines].join('\n') : lines.join('\n'))
        : userText;
    const prefix = buildSpeakerPrefix(message, env);
    return body ? `${prefix} ${body}` : prefix;
}

function shouldHandle(message: IncomingMessage, botName?: string, botId?: string): boolean {
    if (message.source === 'private') return true;
    if (message.source !== 'group') return false;

    const content = message.content ?? '';
    const name = botName?.trim() ?? '';
    if (name && content.includes(name)) return true;

    const quotedFrom = message.quote?.referFrom?.trim() ?? '';
    const quotedName = message.quote?.referSenderName?.trim() ?? '';
    if (botId && quotedFrom && quotedFrom === botId) return true;
    if (name && quotedName && quotedName === name) return true;
    return false;
}

export const openclawAgentPlugin: Plugin = {
    manifest: {
        name: 'openclaw',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    match(message, ctx) {
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_AUTO_FORWARD, false)) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return shouldHandle(
            message,
            resolveBotName(ctx.env),
            resolveBotId(ctx.env, message.platform),
        );
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const gatewayBaseUrl = resolveGatewayBaseUrl(ctx.env);
        const token = ctx.env.XBOT_CHANNEL_GATEWAY_TOKEN?.trim()
            || ctx.env.AGENT_BRIDGE_TOKEN?.trim();
        if (!gatewayBaseUrl || !token) {
            logger.warn('OpenClaw 未配齐，跳过');
            return null;
        }

        const timeoutRaw = Number.parseInt(String(ctx.env.XBOT_CHANNEL_TIMEOUT_MS ?? ''), 10);
        const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
            ? Math.min(timeoutRaw, 900_000)
            : 120_000;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const conversationId = resolveChatId(message);
        let resolved = await resolveOpenClawMedia(message, ctx.env);
        if (resolved) {
            await patchInboundMediaPublicUrl(ctx.env, message.messageId, {
                publicUrl: resolved.url,
                videoPublicUrl: resolved.videoUrl,
            });
        } else if (!message.media && !message.quote?.media) {
            resolved = await findRecentPublicMedia(ctx.env, message);
        }
        const mediaUrl = resolved?.url;
        const mediaKind = resolved?.kind;
        const videoUrl = resolved?.videoUrl;
        const content = buildOpenClawContent(message, ctx.env, mediaUrl, videoUrl, mediaKind);

        try {
            const response = await fetch(`${gatewayBaseUrl}/api/channels/xbot/inbound`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
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
                logger.warn('OpenClaw inbound 失败', {status: response.status});
                return null;
            }
            return handledReply();
        } catch (error) {
            logger.warn('OpenClaw 转发失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        } finally {
            clearTimeout(timer);
        }
    },
};
