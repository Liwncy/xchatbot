import type {HandlerResponse} from '../../../types/reply.js';
import type {AgnesVideoTicketRecord} from './types.js';
import type {AgnesVideoQueryResponse} from './types.js';

const SEP = '━━━━━━━━━━━━';

function formatStatus(status: string): string {
    const normalized = status.trim().toLowerCase();
    const labels: Record<string, string> = {
        queued: '⏳ 排队中',
        pending: '⏳ 等待中',
        processing: '🎞️ 渲染中',
        running: '🎞️ 渲染中',
        completed: '✅ 已完成',
        failed: '❌ 失败',
        unknown: '❓ 未知',
    };
    return labels[normalized] ?? `📊 ${status}`;
}

function formatProgress(progress: number | undefined): string {
    if (!Number.isFinite(progress)) return '—';
    return `${progress}%`;
}

function buildUsageHint(): string {
    return [
        '📖 用法示例',
        SEP,
        '🎬 聪明绘影 一只猫在海边日落时慢慢走动，电影感镜头',
        '📝 引用文字并发送「聪明绘影」→ 文生视频',
        '🖼 引用图片并发送「聪明绘影 人物慢慢转头」→ 图生视频',
        '🔍 查绘影 123456',
    ].join('\n');
}

export function buildSubmittedReply(record: AgnesVideoTicketRecord): HandlerResponse {
    return {
        type: 'text',
        content: [
            '✅ 绘影任务已提交',
            SEP,
            `🔢 查询号：${record.ticket}`,
            `💡 发送「查绘影 ${record.ticket}」查看进度`,
            '🎥 完成后会返回视频',
        ].join('\n'),
    };
}

function parseDurationSeconds(seconds?: string): number | undefined {
    if (!seconds) return undefined;
    const parsed = Number.parseFloat(seconds);
    return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : undefined;
}

export function buildVideoReply(
    record: AgnesVideoTicketRecord,
    query: AgnesVideoQueryResponse,
): HandlerResponse {
    const videoUrl = query.remixed_from_video_id?.trim();
    if (!videoUrl) {
        return {
            type: 'text',
            content: [
                '⚠️ 任务已完成，但没有拿到视频地址',
                '💡 请稍后再查一次',
            ].join('\n'),
        };
    }

    return {
        type: 'video',
        mediaId: videoUrl,
        originalUrl: videoUrl,
        title: '🎬 聪明绘影',
        description: record.prompt.slice(0, 80),
        duration: parseDurationSeconds(query.seconds),
        linkPicUrl: record.thumbUrl,
    };
}

export function buildProgressReply(
    record: AgnesVideoTicketRecord,
    query: AgnesVideoQueryResponse,
): HandlerResponse {
    const status = query.status ?? 'unknown';
    const progress = formatProgress(query.progress);
    const error = query.error?.trim();

    if (status === 'failed') {
        return {
            type: 'text',
            content: [
                '❌ 绘影任务失败',
                SEP,
                `🔢 查询号：${record.ticket}`,
                error ? `📋 原因：${error}` : '📋 原因未知',
            ].join('\n'),
        };
    }

    return {
        type: 'text',
        content: [
            '⏳ 绘影任务进行中',
            SEP,
            `🔢 查询号：${record.ticket}`,
            `📊 状态：${formatStatus(status)}`,
            `📈 进度：${progress}`,
            `💡 稍后再发「查绘影 ${record.ticket}」`,
        ].join('\n'),
    };
}

export function buildMissingPromptReply(): HandlerResponse {
    return {
        type: 'text',
        content: ['✍️ 请在触发词后面加上视频描述', '', buildUsageHint()].join('\n'),
    };
}

export function buildMissingTicketReply(): HandlerResponse {
    return {
        type: 'text',
        content: [
            '🔍 请在「查绘影」后面加上 6 位查询号',
            '💡 例如：查绘影 123456',
        ].join('\n'),
    };
}

export function buildInvalidQueryFormatReply(): HandlerResponse {
    return buildMissingTicketReply();
}

export function buildTicketNotFoundReply(ticket: string): HandlerResponse {
    return {
        type: 'text',
        content: [
            `🔎 没有找到查询号 ${ticket}`,
            '💡 请确认号码是否正确，或是否已过期（保留 7 天）',
        ].join('\n'),
    };
}

export function buildTicketForbiddenReply(): HandlerResponse {
    return {
        type: 'text',
        content: '🚫 这个查询号不是你在当前会话提交的，无法查看',
    };
}

export function buildConfigMissingReply(): HandlerResponse {
    return {
        type: 'text',
        content: '⚙️ 聪明绘影暂未启用，请联系管理员',
    };
}

export function buildQueryFailedReply(ticket: string): HandlerResponse {
    return {
        type: 'text',
        content: [
            '😵 查询失败，请稍后再试',
            `🔢 查询号：${ticket}`,
        ].join('\n'),
    };
}

export function buildSubmitFailedReply(detail?: string): HandlerResponse {
    if (detail?.includes('超时')) {
        return {type: 'text', content: `⏱️ ${detail}`};
    }
    return {
        type: 'text',
        content: '❌ 绘影任务没提交成功，换个描述试试？',
    };
}

export function buildQuoteSubmitFailedReply(detail?: string): HandlerResponse {
    if (detail?.includes('超时')) {
        return {type: 'text', content: `⏱️ ${detail}`};
    }
    return {
        type: 'text',
        content: '❌ 引用绘影没提交成功，换种引用或描述试试？',
    };
}

export function buildQuoteImageDownloadFailedReply(): HandlerResponse {
    return {
        type: 'text',
        content: '🖼 引用的是图片，但没能下载到可处理的数据',
    };
}

export function buildQuoteEmptyTextReply(): HandlerResponse {
    return {
        type: 'text',
        content: '📝 引用的文字为空，请在标题里补充描述，或引用有内容的文字消息',
    };
}

export function buildQuoteUnsupportedReferReply(): HandlerResponse {
    return {
        type: 'text',
        content: '⚠️ 引用绘影需要引用文字或图片，表情等其他类型暂不支持',
    };
}
