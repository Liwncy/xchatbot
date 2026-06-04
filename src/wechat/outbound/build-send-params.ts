import type {ReplyMessage} from '../../types/reply.js';

function resolveReplyMediaUrl(reply: {mediaId: string; originalUrl?: string}): string {
    const originalUrl = reply.originalUrl?.trim();
    if (originalUrl) return originalUrl;
    return reply.mediaId;
}

/**
 * 构建发送给微信网关的 JSON 回复数据。
 *
 * 当 `reply.to` 被设置时会覆盖默认接收者。
 * 当 `reply.mentions` 被设置且消息发送到群聊时，
 * 会包含 `remind` 字段（逗号分隔的 wxid），以便网关 @ 提及这些用户。
 */
export function buildWechatReply(
    reply: ReplyMessage,
    toUser: string,
    roomId?: string,
): Record<string, unknown> {
    const effectiveTo = reply.to ?? (roomId ? roomId : toUser);
    const target: Record<string, unknown> = {to: effectiveTo};

    if (reply.mentions?.length && (roomId || reply.to?.endsWith('@chatroom'))) {
        target.remind = reply.mentions.join(',');
    }

    if (reply.type === 'text') {
        return {...target, type: 'text', content: reply.content};
    }

    if (reply.type === 'image') {
        return {...target, type: 'image', mediaUrl: resolveReplyMediaUrl(reply)};
    }

    if (reply.type === 'voice') {
        return {
            ...target,
            type: 'voice',
            mediaUrl: resolveReplyMediaUrl(reply),
            duration: reply.duration ?? 5000,
            format: reply.format ?? 4,
        };
    }

    if (reply.type === 'video') {
        return {
            ...target,
            type: 'video',
            mediaUrl: resolveReplyMediaUrl(reply),
            title: reply.title ?? '',
            description: reply.description ?? '',
        };
    }

    if (reply.type === 'news') {
        return {
            ...target,
            type: 'news',
            articles: reply.articles,
        };
    }

    if (reply.type === 'card') {
        return {
            ...target,
            type: 'card',
            cardContent: reply.cardContent,
        };
    }

    if (reply.type === 'app') {
        return {
            ...target,
            type: 'app',
            appType: reply.appType,
            appXml: reply.appXml,
        };
    }

    if (reply.type === 'markdown') {
        return {...target, type: 'text', content: reply.content};
    }

    return {};
}

