const MAX_ITEMS = 100;
const MAX_ROLES = 10;
const MAX_NAME_LENGTH = 30;
const MAX_CONTENT_LENGTH = 300;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const HH_MM = /^(\d{1,2}):(\d{2})$/u;
const FULL_TIME = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/u;

export class FakeForwardAskError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FakeForwardAskError';
    }
}

export interface FakeForwardLine {
    name: string;
    content: string;
    timestampMs: number;
}

export function parseFakeForwardScript(script: string, nowMs = Date.now()): FakeForwardLine[] {
    if (!script.trim()) {
        throw new FakeForwardAskError('缺聊天内容。每行填 姓名|时间|内容，时间可空。');
    }

    const lines: FakeForwardLine[] = [];
    let lastTs: number | undefined;
    for (const raw of script.split(/\r?\n/u)) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const row = parseRow(trimmed);
        let ts: number;
        if (!row.timeText) {
            ts = lastTs == null ? nowMs : lastTs + 60_000;
        } else {
            ts = parseTime(row.timeText, nowMs, lastTs);
        }
        lastTs = ts;
        lines.push({name: row.name, content: row.content, timestampMs: ts});
    }

    if (lines.length === 0) {
        throw new FakeForwardAskError('缺聊天内容。每行填 姓名|时间|内容，时间可空。');
    }
    if (lines.length > MAX_ITEMS) {
        throw new FakeForwardAskError(`一次最多 ${MAX_ITEMS} 条聊天。`);
    }
    const roles = new Set(lines.map((line) => line.name));
    if (roles.size > MAX_ROLES) {
        throw new FakeForwardAskError(`一次最多 ${MAX_ROLES} 个角色。`);
    }
    return lines;
}

function splitLimited(line: string, maxParts: number): string[] {
    const parts: string[] = [];
    let rest = line;
    while (parts.length < maxParts - 1) {
        const index = rest.indexOf('|');
        if (index < 0) {
            parts.push(rest);
            return parts;
        }
        parts.push(rest.slice(0, index));
        rest = rest.slice(index + 1);
    }
    parts.push(rest);
    return parts;
}

function parseRow(line: string): {name: string; timeText: string; content: string} {
    const parts = splitLimited(line, 3);
    if (parts.length === 1) {
        throw new FakeForwardAskError(`行格式应为 姓名|时间|内容 或 姓名|内容：${clip(line)}`);
    }
    const name = normalizeName(parts[0] ?? '');
    if (parts.length === 2) {
        return {name, timeText: '', content: normalizeContent(parts[1] ?? '')};
    }
    const middle = (parts[1] ?? '').trim();
    const content = parts[2] ?? '';
    if (!middle || looksLikeTime(middle)) {
        return {name, timeText: middle, content: normalizeContent(content)};
    }
    return {name, timeText: '', content: normalizeContent(`${middle}|${content}`)};
}

function looksLikeTime(text: string): boolean {
    return HH_MM.test(text) || FULL_TIME.test(text);
}

export function parseTime(input: string, nowMs: number, referenceTs?: number): number {
    const trimmed = input.trim();
    const shortTime = HH_MM.exec(trimmed);
    if (shortTime) {
        const hour = Number.parseInt(shortTime[1] ?? '', 10);
        const minute = Number.parseInt(shortTime[2] ?? '', 10);
        if (hour > 23 || minute > 59) {
            throw new FakeForwardAskError(`时间格式应为 HH:mm 或 YYYY-MM-DD HH:mm：${trimmed}`);
        }
        const base = referenceTs == null ? shanghaiParts(nowMs) : shanghaiParts(referenceTs);
        return shanghaiToEpoch(base.year, base.month, base.day, hour, minute);
    }
    const full = FULL_TIME.exec(trimmed);
    if (!full) {
        throw new FakeForwardAskError(`时间格式应为 HH:mm 或 YYYY-MM-DD HH:mm：${trimmed}`);
    }
    const [year, month, day] = (full[1] ?? '').split('-').map((item) => Number.parseInt(item, 10));
    const hour = Number.parseInt(full[2] ?? '', 10);
    const minute = Number.parseInt(full[3] ?? '', 10);
    if (!year || !month || !day || hour > 23 || minute > 59) {
        throw new FakeForwardAskError(`时间格式应为 HH:mm 或 YYYY-MM-DD HH:mm：${trimmed}`);
    }
    return shanghaiToEpoch(year, month, day, hour, minute);
}

function normalizeName(value: string): string {
    const name = value.trim();
    if (!name) throw new FakeForwardAskError('角色姓名不能为空');
    if (name.length > MAX_NAME_LENGTH) {
        throw new FakeForwardAskError(`角色姓名不能超过 ${MAX_NAME_LENGTH} 个字`);
    }
    return name;
}

function normalizeContent(value: string): string {
    const content = value.trim();
    if (!content) throw new FakeForwardAskError('聊天内容不能为空');
    if (content.length > MAX_CONTENT_LENGTH) {
        throw new FakeForwardAskError(`单条内容不能超过 ${MAX_CONTENT_LENGTH} 个字`);
    }
    return content;
}

function shanghaiParts(ms: number): {year: number; month: number; day: number} {
    const shifted = new Date(ms + SHANGHAI_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

function shanghaiToEpoch(year: number, month: number, day: number, hour: number, minute: number): number {
    return Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS;
}

function clip(text: string): string {
    return text.length <= 40 ? text : `${text.slice(0, 40)}...`;
}
