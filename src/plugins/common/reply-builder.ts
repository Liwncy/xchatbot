import {isHttpUrl, toLinkReply, toMediaPayload} from './shared';

export type CommonReplyType = 'text' | 'image' | 'video' | 'voice' | 'link';

interface ReplyBuildRule {
    rType: CommonReplyType;
    keyword?: string | string[];
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    voiceFallbackText?: string;
}

/**
 * 按 rType 统一构建回复对象。
 *
 * - text: 直接输出字符串（对象会 JSON.stringify）
 * - link: 构建 news 结构
 * - image/video/voice: 转换为 mediaId
 *
 * 对于 image/video，如果原始值是 HTTP URL，会在回复对象上附加 `originalUrl`，
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

    // 记录原始 URL，供发送失败时降级为链接回复
    const rawStr = typeof value === 'string' ? value.trim() : '';
    const originalUrl = isHttpUrl(rawStr) ? rawStr : undefined;

    const mediaId = await toMediaPayload(value, logPrefix);
    if (!mediaId) return null;

    if (rule.rType === 'voice') {
        return {
            type: 'voice' as const,
            mediaId,
            originalUrl,
            format: rule.voiceFormat,
            duration: rule.voiceDurationMs,
            fallbackText: rule.voiceFallbackText,
        };
    }

    return {type: rule.rType, mediaId, originalUrl};
}

