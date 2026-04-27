import {DEFAULT_SCHEDULER_TIMEZONE} from './types.js';

const MINUTES_PER_YEAR = 366 * 24 * 60;
const WEEKDAY_NAME_MAP: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};
const MONTH_NAME_MAP: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

interface CronField {
    wildcard: boolean;
    values: Set<number>;
}

interface CronMatchInput {
    minute: number;
    hour: number;
    dayOfMonth: number;
    month: number;
    dayOfWeek: number;
}

interface ParsedCronExpression {
    minute: CronField;
    hour: CronField;
    dayOfMonth: CronField;
    month: CronField;
    dayOfWeek: CronField;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
    });
}

function toZonedDateParts(timestampMs: number, timeZone: string): CronMatchInput {
    const parts = getFormatter(timeZone).formatToParts(new Date(timestampMs));
    const index = new Map(parts.map((part) => [part.type, part.value]));
    const weekdayText = (index.get('weekday') ?? '').toLowerCase().slice(0, 3);
    const dayOfWeek = WEEKDAY_NAME_MAP[weekdayText];
    if (dayOfWeek == null) {
        throw new Error(`Unsupported weekday for timezone ${timeZone}: ${weekdayText}`);
    }
    return {
        minute: Number(index.get('minute') ?? 0),
        hour: Number(index.get('hour') ?? 0),
        dayOfMonth: Number(index.get('day') ?? 0),
        month: Number(index.get('month') ?? 0),
        dayOfWeek,
    };
}

function parseAlias(value: string, aliases?: Record<string, number>): number {
    const normalized = value.trim().toLowerCase();
    if (aliases?.[normalized] != null) {
        return aliases[normalized];
    }
    const numeric = Number(normalized);
    if (!Number.isInteger(numeric)) {
        throw new Error(`Invalid cron token: ${value}`);
    }
    return numeric;
}

function normalizeDayOfWeek(value: number): number {
    return value === 7 ? 0 : value;
}

function addRangeValues(target: Set<number>, start: number, end: number, step: number, max: number): void {
    for (let value = start; value <= end; value += step) {
        target.add(max === 6 ? normalizeDayOfWeek(value) : value);
    }
}

function parseCronField(
    input: string,
    min: number,
    max: number,
    aliases?: Record<string, number>,
): CronField {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Cron field cannot be empty');
    const wildcard = trimmed === '*';
    const values = new Set<number>();
    const segments = trimmed.split(',').map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) throw new Error('Cron field cannot be empty');

    for (const segment of segments) {
        const [base, stepText] = segment.split('/');
        const step = stepText == null ? 1 : Number(stepText);
        if (!Number.isInteger(step) || step <= 0) {
            throw new Error(`Invalid cron step: ${segment}`);
        }

        if (base === '*') {
            addRangeValues(values, min, max, step, max);
            continue;
        }

        if (base.includes('-')) {
            const [startText, endText] = base.split('-');
            const start = parseAlias(startText, aliases);
            const end = parseAlias(endText, aliases);
            if (start > end) {
                throw new Error(`Invalid cron range: ${segment}`);
            }
            if (start < min || end > max) {
                throw new Error(`Cron range out of bounds: ${segment}`);
            }
            addRangeValues(values, start, end, step, max);
            continue;
        }

        const value = parseAlias(base, aliases);
        const normalized = max === 6 ? normalizeDayOfWeek(value) : value;
        if (normalized < min || normalized > max) {
            throw new Error(`Cron value out of bounds: ${segment}`);
        }
        values.add(normalized);
    }

    return {
        wildcard,
        values,
    };
}

function parseCronExpression(expression: string): ParsedCronExpression {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new Error('Cron expression must contain exactly 5 fields');
    }
    return {
        minute: parseCronField(parts[0], 0, 59),
        hour: parseCronField(parts[1], 0, 23),
        dayOfMonth: parseCronField(parts[2], 1, 31),
        month: parseCronField(parts[3], 1, 12, MONTH_NAME_MAP),
        dayOfWeek: parseCronField(parts[4], 0, 6, WEEKDAY_NAME_MAP),
    };
}

function fieldMatches(field: CronField, value: number): boolean {
    return field.wildcard || field.values.has(value);
}

function matchesCron(parsed: ParsedCronExpression, input: CronMatchInput): boolean {
    if (!fieldMatches(parsed.minute, input.minute)) return false;
    if (!fieldMatches(parsed.hour, input.hour)) return false;
    if (!fieldMatches(parsed.month, input.month)) return false;

    const dayOfMonthMatch = fieldMatches(parsed.dayOfMonth, input.dayOfMonth);
    const dayOfWeekMatch = fieldMatches(parsed.dayOfWeek, input.dayOfWeek);

    if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) return true;
    if (parsed.dayOfMonth.wildcard) return dayOfWeekMatch;
    if (parsed.dayOfWeek.wildcard) return dayOfMonthMatch;
    return dayOfMonthMatch || dayOfWeekMatch;
}

export function validateCronExpression(expression: string): void {
    parseCronExpression(expression);
}

export function resolveSchedulerTimezone(timezone?: string | null): string {
    const resolved = timezone?.trim() || DEFAULT_SCHEDULER_TIMEZONE;
    try {
        getFormatter(resolved).format(new Date());
    } catch {
        throw new Error(`Unsupported timezone: ${resolved}`);
    }
    return resolved;
}

export function computeNextRunAt(expression: string, fromUnixSeconds: number, timezone?: string | null): number {
    const parsed = parseCronExpression(expression);
    const resolvedTimezone = resolveSchedulerTimezone(timezone);
    let candidate = Math.floor(fromUnixSeconds / 60) * 60 + 60;
    for (let index = 0; index < MINUTES_PER_YEAR; index += 1) {
        const parts = toZonedDateParts(candidate * 1000, resolvedTimezone);
        if (matchesCron(parsed, parts)) {
            return candidate;
        }
        candidate += 60;
    }
    throw new Error(`Unable to resolve next run time within ${MINUTES_PER_YEAR} minutes`);
}

