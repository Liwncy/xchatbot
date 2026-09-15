import {formatHistoryTime} from '../chat-log/query.js';
import type {AppLogRecord} from './types.js';

const DETAIL_CLIP = 180;

function clip(value: string, max: number): string {
    const text = value.replace(/\s+/gu, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function formatLine(row: AppLogRecord): string {
    const time = row.createdAt ? formatHistoryTime(row.createdAt) : '-';
    let line = `[${time}] ${row.level}`;
    if (row.stage) line += ` stage=${row.stage}`;
    if (row.sessionId) line += ` session=${row.sessionId}`;
    if (row.messageId) line += ` id=${row.messageId}`;
    if (row.pluginName) line += ` plugin=${row.pluginName}`;
    line += `: ${clip(row.summary, 200)}`;
    const detail = clip(row.detail, DETAIL_CLIP);
    if (detail) line += ` | ${detail}`;
    return line;
}

export function formatAppLogList(
    rows: AppLogRecord[],
    windowLabel: string | undefined,
    pageSize: number,
    pageForward: boolean,
): string {
    if (rows.length === 0) {
        let hint = '没有找到运行日志。';
        if (windowLabel && windowLabel !== '最近') hint += ` 当前窗口：${windowLabel}。`;
        return hint;
    }
    const lines = [`共 ${rows.length} 条（旧→新）${windowLabel ? ` 窗口=${windowLabel}` : ''}`];
    for (const row of rows) lines.push(formatLine(row));
    if (rows.length >= pageSize && pageSize > 0 && pageSize < Number.MAX_SAFE_INTEGER) {
        if (pageForward) {
            const newest = rows[rows.length - 1]?.id;
            if (newest) lines.push(`本页已满，可能还有更晚。再查时 afterId=${newest}`);
        } else {
            const oldest = rows[0]?.id;
            if (oldest) lines.push(`本页已满，可能还有更早。再查时 beforeId=${oldest}`);
        }
    }
    return lines.join('\n');
}
