import {isHttpUrl, toLinkReply, toMediaPayloadResult} from './shared';

export type CommonReplyType = 'text' | 'image' | 'video' | 'voice' | 'link' | 'card' | 'app';

type MediaReplyType = Extract<CommonReplyType, 'image' | 'video' | 'voice'>;

interface ReplyBuildRule {
    rType: CommonReplyType;
    keyword?: string | string[];
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    voiceFallbackText?: string;
    cardUsername?: string;
    cardNickname?: string;
    cardAlias?: string;
    appType?: number;
    appXml?: string;
}

interface ResolvedMediaInput {
    directUrl?: string;
    payloadValue?: string;
    title?: string;
    description?: string;
    thumbUrl?: string;
    thumbData?: string;
    duration?: number;
    format?: number;
    fallbackText?: string;
}

function getObjectField(obj: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (!(key in obj)) continue;
        const value = obj[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
}

function getObjectStringField(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function getObjectNumberField(obj: Record<string, unknown>, keys: string[]): number | undefined {
    const value = getObjectField(obj, keys);
    if (value === undefined || value === null || value === '') return undefined;
    const num = Number(value);
    if (!Number.isFinite(num)) return undefined;
    return Math.floor(num);
}

function resolveMediaInput(rType: MediaReplyType, value: unknown): ResolvedMediaInput {
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return {};
        return isHttpUrl(raw)
            ? {directUrl: raw}
            : {payloadValue: raw};
    }

    if (!value || typeof value !== 'object') {
        return {};
    }

    const obj = value as Record<string, unknown>;
    const urlKeys: Record<MediaReplyType, string[]> = {
        image: ['originalUrl', 'image_url', 'imageUrl', 'url', 'file_url', 'fileUrl', 'media_url', 'mediaUrl'],
        video: ['originalUrl', 'video_url', 'videoUrl', 'url', 'file_url', 'fileUrl', 'media_url', 'mediaUrl'],
        voice: ['originalUrl', 'voice_url', 'voiceUrl', 'audio_url', 'audioUrl', 'url', 'file_url', 'fileUrl', 'media_url', 'mediaUrl'],
    };
    const payloadKeys: Record<MediaReplyType, string[]> = {
        image: ['image', 'base64', 'data', 'file', 'payload', 'media', 'content', 'mediaId'],
        video: ['video', 'base64', 'data', 'file', 'payload', 'media', 'content', 'mediaId'],
        voice: ['voice', 'audio', 'base64', 'data', 'file', 'payload', 'media', 'content', 'mediaId'],
    };

    const directUrl = getObjectStringField(obj, urlKeys[rType]);
    const payloadCandidate = getObjectField(obj, payloadKeys[rType]);
    const payloadValue = typeof payloadCandidate === 'string' && payloadCandidate.trim()
        ? payloadCandidate.trim()
        : undefined;
    const normalizedDirectUrl = directUrl || (payloadValue && isHttpUrl(payloadValue) ? payloadValue : '');
    const coverCandidate = getObjectStringField(obj, ['thumb_url', 'thumbUrl', 'cover_url', 'coverUrl', 'image_url', 'imageUrl', 'picUrl']);
    const thumbCandidate = getObjectStringField(obj, ['thumb', 'thumbData', 'thumb_data', 'cover', 'coverBase64', 'cover_base64']);

    return {
        directUrl: normalizedDirectUrl || undefined,
        payloadValue: normalizedDirectUrl ? undefined : payloadValue,
        title: getObjectStringField(obj, ['title', 'name']),
        description: getObjectStringField(obj, ['description', 'desc', 'summary']),
        thumbUrl: coverCandidate || (thumbCandidate && isHttpUrl(thumbCandidate) ? thumbCandidate : ''),
        thumbData: thumbCandidate && !isHttpUrl(thumbCandidate) ? thumbCandidate : undefined,
        duration: getObjectNumberField(obj, ['duration', 'durationSeconds', 'duration_seconds']),
        format: getObjectNumberField(obj, ['format', 'voiceFormat', 'voice_format', 'audioFormat', 'audio_format']),
        fallbackText: getObjectStringField(obj, ['fallbackText', 'fallback_text']),
    };
}

/**
 * 按 rType 统一构建回复对象。
 *
 * - text: 直接输出字符串（对象会 JSON.stringify）
 * - link: 构建 news 结构
 * - image/video/voice: 优先保留原始媒体值；字符串 URL 直接透传，base64 继续兼容
 * - 若接口返回 JSON 对象，也会尝试从常见字段中提取 URL/base64/封面/时长等信息
 *
 * 对于 image/video/voice，如果原始值是 HTTP URL，会在回复对象上附加 `originalUrl`，
 * 以便发送失败时可以降级为链接消息。
 */
export async function buildCommonReply(
    rule: ReplyBuildRule,
    value: unknown,
    logPrefix: string,
) {
    if (rule.rType === 'text') {
        const content = typeof value === 'string' ? value : JSON.stringify(value);
        return content ? {type: 'text' as const, content} : null;
    }

    if (rule.rType === 'link') {
        return toLinkReply(rule, value);
    }

    if (rule.rType === 'card') {
        const obj = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const card_username = getObjectStringField(obj, ['card_username', 'username']) || rule.cardUsername || '';
        const card_nickname = getObjectStringField(obj, ['card_nickname', 'nickname']) || rule.cardNickname || '';
        const card_alias = getObjectStringField(obj, ['card_alias', 'alias']) || rule.cardAlias || '';
        if (!card_username || !card_nickname) return null;
        return {
            type: 'card' as const,
            cardContent: {card_username, card_nickname, card_alias},
        };
    }

    if (rule.rType === 'app') {
        const obj = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const appXml = (typeof value === 'string' ? value.trim() : '')
            || getObjectStringField(obj, ['xml', 'appXml'])
            || (rule.appXml?.trim() ?? '');
        const rawType = obj.type ?? obj.appType ?? rule.appType;
        const appType = Number.isFinite(Number(rawType)) ? Math.floor(Number(rawType)) : 5;
        if (!appXml) return null;
        return {
            type: 'app' as const,
            appType,
            appXml,
        };
    }

    const resolved = resolveMediaInput(rule.rType, value);
    const originalUrl = resolved.directUrl;

    if (originalUrl) {
        if (rule.rType === 'voice') {
            return {
                type: 'voice' as const,
                mediaId: originalUrl,
                originalUrl,
                format: resolved.format ?? rule.voiceFormat,
                duration: resolved.duration ?? rule.voiceDurationMs,
                fallbackText: resolved.fallbackText || rule.voiceFallbackText,
            };
        }

        if (rule.rType === 'video') {
            return {
                type: 'video' as const,
                mediaId: originalUrl,
                originalUrl,
                title: resolved.title,
                description: resolved.description,
                linkPicUrl: resolved.thumbUrl,
                thumbData: resolved.thumbData,
                duration: resolved.duration,
            };
        }

        return {type: rule.rType, mediaId: originalUrl, originalUrl};
    }

    const mediaResult = await toMediaPayloadResult(resolved.payloadValue ?? value, logPrefix, {
        expectedKind: rule.rType === 'video' ? 'video' : undefined,
    });
    if (!mediaResult) return null;

    const mediaId = mediaResult.payload;

    if (rule.rType === 'voice') {
        return {
            type: 'voice' as const,
            mediaId,
            originalUrl,
            format: resolved.format ?? rule.voiceFormat,
            duration: resolved.duration ?? rule.voiceDurationMs,
            fallbackText: resolved.fallbackText || rule.voiceFallbackText,
        };
    }

    if (rule.rType === 'video') {
        return {
            type: 'video' as const,
            mediaId,
            originalUrl,
            title: resolved.title,
            description: resolved.description,
            linkPicUrl: resolved.thumbUrl,
            thumbData: resolved.thumbData,
            duration: resolved.duration ?? mediaResult.durationSeconds,
        };
    }

    return {type: rule.rType, mediaId, originalUrl};
}

