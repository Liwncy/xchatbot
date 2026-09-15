export type ChatHistoryWindow = {
    sinceUnix?: number;
    untilUnix?: number;
    label: string;
};

export type ChatHistoryQuery = {
    sessionId: string;
    platform?: string;
    direction?: 'inbound' | 'outbound';
    sinceUnix?: number;
    untilUnix?: number;
    senderId?: string;
    senderName?: string;
    keyword?: string;
    msgType?: string;
    beforeId?: number;
    afterId?: number;
    limit: number;
};

const TZ = 'Asia/Shanghai';
const MAX_HOURS = 168;
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_LIMIT = 200;
const MAX_LIMIT = 200;

const FULL = /(\d{4})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})(?:\s*日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;
const MONTH_DAY = /(\d{1,2})\s*[-月/.]\s*(\d{1,2})(?:\s*日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;
const DAY_ONLY = /^(\d{1,2})\s*号?$/u;

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function shanghaiNow(): {year: number; month: number; day: number} {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const pick = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? '0');
    return {year: pick('year'), month: pick('month'), day: pick('day')};
}

function toUnix(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
    const ms = Date.parse(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+08:00`);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

function formatUnix(unix: number): string {
    const date = new Date(unix * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const pick = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
    return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

type ParsedClock = {hour: number; minute: number; second: number};

function clockOf(hour?: string, minute?: string, second?: string): ParsedClock | null {
    if (hour == null) return null;
    const h = Number(hour);
    const m = Number(minute);
    const s = second == null ? 0 : Number(second);
    if (h > 23 || m > 59 || s > 59) return null;
    return {hour: h, minute: m, second: s};
}

function addDays(year: number, month: number, day: number, days: number): {year: number; month: number; day: number} {
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return {year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate()};
}

type ParsedDateTime = {
    year: number;
    month: number;
    day: number;
    unix: number;
    hasClock: boolean;
};

function ofDate(
    year: number,
    month: number,
    day: number,
    clock: ParsedClock | null,
): ParsedDateTime | null {
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    const unix = toUnix(year, month, day, clock?.hour ?? 0, clock?.minute ?? 0, clock?.second ?? 0);
    if (!Number.isFinite(unix)) return null;
    return {year, month, day, unix, hasClock: Boolean(clock)};
}

function parseDateTime(raw: string, today: {year: number; month: number; day: number}): ParsedDateTime | null {
    const text = raw.replace(/号/gu, ' ').replace(/\s+/gu, ' ').trim();
    if (!text) return null;
    const full = FULL.exec(text);
    if (full && full[0] === text) {
        return ofDate(Number(full[1]), Number(full[2]), Number(full[3]), clockOf(full[4], full[5], full[6]));
    }
    const md = MONTH_DAY.exec(text);
    if (md && md[0] === text) {
        let year = today.year;
        const month = Number(md[1]);
        const day = Number(md[2]);
        if (month > 12 || day < 1) return null;
        if (month > today.month || (month === today.month && day > today.day)) year -= 1;
        return ofDate(year, month, day, clockOf(md[3], md[4], md[5]));
    }
    const dayOnly = DAY_ONLY.exec(text);
    if (dayOnly) {
        const day = Number(dayOnly[1]);
        if (day < 1 || day > 31) return null;
        let year = today.year;
        let month = today.month;
        if (day > today.day) {
            month -= 1;
            if (month < 1) {
                month = 12;
                year -= 1;
            }
        }
        return ofDate(year, month, day, null);
    }
    return null;
}

function nextDayUnix(parsed: ParsedDateTime): number {
    const next = addDays(parsed.year, parsed.month, parsed.day, 1);
    return toUnix(next.year, next.month, next.day);
}

export function resolveHistoryWindow(args: {
    date?: string;
    from?: string;
    until?: string;
    hours?: number;
}): {window: ChatHistoryWindow; error?: string} {
    const today = shanghaiNow();
    if (args.date?.trim()) {
        const parsed = parseDateTime(args.date.trim(), today);
        if (!parsed) {
            return {window: {label: ''}, error: 'date 认不出来，请写成 2026-08-29，或 8-29、29号；也可带时间 2026-08-29 14:30:05。'};
        }
        const sinceUnix = parsed.unix;
        const untilUnix = nextDayUnix(parsed);
        return {window: {sinceUnix, untilUnix, label: `${formatUnix(sinceUnix)} ~ ${formatUnix(untilUnix)}`}};
    }
    if (args.from?.trim() || args.until?.trim()) {
        let sinceUnix: number | undefined;
        let untilUnix: number | undefined;
        if (args.from?.trim()) {
            const parsed = parseDateTime(args.from.trim(), today);
            if (!parsed) return {window: {label: ''}, error: 'from 认不出来，请写成 2026-08-29 或 2026-08-29 17:00:00。'};
            sinceUnix = parsed.unix;
        }
        if (args.until?.trim()) {
            const parsed = parseDateTime(args.until.trim(), today);
            if (!parsed) return {window: {label: ''}, error: 'until 认不出来，请写成 2026-08-29 或 2026-08-29 18:00:00。'};
            untilUnix = parsed.hasClock ? parsed.unix : nextDayUnix(parsed);
        }
        if (sinceUnix != null && untilUnix != null && sinceUnix >= untilUnix) {
            return {window: {label: ''}, error: 'from 必须早于 until。'};
        }
        return {
            window: {
                sinceUnix,
                untilUnix,
                label: `${sinceUnix == null ? '最早' : formatUnix(sinceUnix)} ~ ${untilUnix == null ? '现在' : formatUnix(untilUnix)}`,
            },
        };
    }
    if (args.hours && args.hours >= 1) {
        const span = Math.min(Math.floor(args.hours), MAX_HOURS);
        const sinceUnix = Math.floor(Date.now() / 1000) - span * 3600;
        return {window: {sinceUnix, label: `${formatUnix(sinceUnix)} ~ 现在`}};
    }
    return {window: {label: '最近'}};
}

export function sanitizeHistoryLimit(limit: number | undefined, windowed: boolean): number {
    if (limit == null || limit < 1) return windowed ? DEFAULT_WINDOW_LIMIT : DEFAULT_LIMIT;
    return Math.min(Math.floor(limit), MAX_LIMIT);
}

/** 前缀 scope= 映射到 D1 session_id。 */
export function sessionIdFromScope(scope: string): string {
    let text = scope.trim();
    const eq = text.toLowerCase().startsWith('scope') ? text.indexOf('=') : -1;
    if (eq > 0) text = text.slice(eq + 1).trim();
    if (text.startsWith('group:')) return text.slice('group:'.length);
    if (text.startsWith('user:')) return `private:${text.slice('user:'.length)}`;
    if (text.endsWith('@chatroom')) return text;
    return '';
}

export function formatHistoryTime(unix: number): string {
    return formatUnix(unix);
}
