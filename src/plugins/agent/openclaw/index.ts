import type {InboundMedia, IncomingMessage} from '../../../core/message.js';
import {resolveBotId, resolveBotName} from '../../../core/bot.js';
import {resolveChatId} from '../../../core/context.js';
import {handledReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';

type OpenClawMediaKind = 'image' | 'video' | 'emoji';

const DEFAULT_CLIENT_ID = 'xchatbot-worker';

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

function resolveMedia(message: IncomingMessage): InboundMedia | undefined {
    return message.media ?? message.quote?.media;
}

function resolveMediaKind(message: IncomingMessage): OpenClawMediaKind | undefined {
    if (message.type === 'video' || message.quote?.referType === 43) return 'video';
    if (message.type === 'emoji' || message.quote?.referType === 47) return 'emoji';
    if (message.type === 'image' || message.quote?.referType === 3) return 'image';
    const url = resolveMedia(message)?.url;
    return isHttpUrl(url) ? 'image' : undefined;
}

function mediaAddressLabel(kind: OpenClawMediaKind | undefined): string {
    if (kind === 'emoji') return '表情地址';
    if (kind === 'video') return '视频地址';
    return '图片地址';
}

function buildOpenClawContent(message: IncomingMessage, mediaUrl?: string): string {
    const userText = message.content?.trim() || message.quote?.title?.trim() || '';
    const media = resolveMedia(message);
    const kind = resolveMediaKind(message);
    const lines: string[] = [];
    const url = (isHttpUrl(mediaUrl) ? mediaUrl.trim() : undefined)
        ?? (media?.url && isHttpUrl(media.url) ? media.url.trim() : undefined);
    if (url) lines.push(`${mediaAddressLabel(kind)}: ${url}`);
    if (media?.md5?.trim()) lines.push(`MD5: ${media.md5.trim()}`);
    if (!lines.length) return userText;
    if (!userText) return lines.join('\n');
    return [userText, ...lines].join('\n');
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

        const clientId = ctx.env.XBOT_CHANNEL_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;
        const timeoutRaw = Number.parseInt(String(ctx.env.XBOT_CHANNEL_TIMEOUT_MS ?? ''), 10);
        const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
            ? Math.min(timeoutRaw, 900_000)
            : 120_000;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const conversationId = resolveChatId(message);
        const media = resolveMedia(message);
        const mediaUrl = isHttpUrl(media?.url) ? media.url.trim() : undefined;
        const mediaKind = mediaUrl ? resolveMediaKind(message) : undefined;
        const content = buildOpenClawContent(message, mediaUrl);

        try {
            await fetch(`${gatewayBaseUrl}/api/channels/xbot/connect`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    accountId: 'Primary',
                    clientId,
                    connId: clientId,
                    wechatApiBaseUrl: ctx.env.WECHAT_API_BASE_URL,
                }),
                signal: controller.signal,
            });

            const response = await fetch(`${gatewayBaseUrl}/api/channels/xbot/inbound`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    accountId: 'Primary',
                    clientId,
                    connId: clientId,
                    messageId: message.messageId,
                    source: message.source === 'group' ? 'group' : 'private',
                    from: message.from,
                    senderName: message.senderName,
                    conversationId,
                    roomId: message.room?.id,
                    type: message.type,
                    content,
                    ...(mediaUrl ? {mediaUrl} : {}),
                    ...(mediaKind ? {mediaKind} : {}),
                    timestamp: message.timestamp,
                    botMentioned: message.source === 'group',
                    forceDispatch: true,
                    wechatApiBaseUrl: ctx.env.WECHAT_API_BASE_URL,
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
