import type {ChatMessageRecord} from './types.js';
import {formatHistoryTime} from './query.js';

const LINE_CLIP = 200;

function clip(value: string, max: number): string {
    const text = value.replace(/\s+/gu, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function looksLikeLocalFile(value: string): boolean {
    const text = value.trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
    return lower.startsWith('file:') || text.includes('\\') || text.startsWith('/');
}

function speaker(id: string, name: string): string {
    const userId = id.trim() || 'unknown';
    const nick = name.trim();
    return !nick || nick === userId ? userId : `${userId}/${nick}`;
}

function historyBody(row: ChatMessageRecord): string {
    let text = clip(row.contentText ?? '', LINE_CLIP);
    if (looksLikeLocalFile(text)) text = '';
    const type = row.msgType?.trim() ?? '';
    if (!text) text = type ? `[${type}]` : '[消息]';
    let payload: Record<string, unknown> = {};
    try {
        payload = row.payloadJson ? JSON.parse(row.payloadJson) as Record<string, unknown> : {};
    } catch {
        payload = {};
    }
    const media = payload.media && typeof payload.media === 'object'
        ? payload.media as Record<string, unknown>
        : {};
    const md5 = typeof media.md5 === 'string' ? media.md5.trim() : '';
    const url = [media.publicUrl, media.url, payload.url]
        .find((item): item is string => typeof item === 'string' && /^https?:\/\//iu.test(item.trim()));
    if (md5 && !text.includes(`md5=${md5}`)) text += ` md5=${md5}`;
    if (url && !text.includes(url.trim())) text += ` url=${url.trim()}`;
    return text.trim();
}

function formatLine(row: ChatMessageRecord): string {
    const time = row.createdAt ? formatHistoryTime(row.createdAt) : '-';
    let line = `[${time}] ${row.direction} ${speaker(row.senderId, row.senderName)} type=${row.msgType || 'text'}`;
    if (row.messageId) line += ` id=${row.messageId}`;
    line += `: ${historyBody(row)}`;
    return line;
}

export function formatHistoryList(
    rows: ChatMessageRecord[],
    windowLabel: string | undefined,
    pageSize: number,
    pageForward: boolean,
): string {
    if (rows.length === 0) {
        let hint = '没有找到记录。核对 scope 是否与前缀完全一致（含 @chatroom）。';
        if (windowLabel && windowLabel !== '最近') {
            hint += ` 当前窗口：${windowLabel}。库里只存接入后的通道原文，窗口之前的补不回来。`;
        }
        return hint;
    }
    const lines = [`共 ${rows.length} 条（旧→新）${windowLabel ? ` 窗口=${windowLabel}` : ''}`];
    for (const row of rows) lines.push(formatLine(row));
    if (rows.length >= pageSize && pageSize > 0 && pageSize < Number.MAX_SAFE_INTEGER) {
        if (pageForward) {
            const newest = rows[rows.length - 1]?.id;
            if (newest) {
                lines.push(`本页已满，窗口里可能还有更晚。再查时 afterId=${newest}，把两页拼一起再总结，不要说已经看完。`);
            }
        } else {
            const oldest = rows[0]?.id;
            if (oldest) lines.push(`本页已满，可能还有更早。再查时 beforeId=${oldest}`);
        }
    }
    return lines.join('\n');
}
