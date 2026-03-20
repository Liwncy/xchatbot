import {toLinkReply, toMediaPayload} from './shared';

export type CommonReplyType = 'text' | 'image' | 'video' | 'voice' | 'link';

interface ReplyBuildRule {
    rType: CommonReplyType;
    keyword?: string | string[];
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
}

/**
 * 按 rType 统一构建回复对象。
 *
 * - text: 直接输出字符串（对象会 JSON.stringify）
 * - link: 构建 news 结构
 * - image/video/voice: 转换为 mediaId
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

    const mediaId = await toMediaPayload(value, logPrefix);
    if (!mediaId) return null;
    return {type: rule.rType, mediaId};
}

