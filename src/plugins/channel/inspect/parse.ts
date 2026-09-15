export type InspectKind = 'history' | 'log';

export type InspectCommand =
    | {kind: InspectKind; help: true}
    | {
        kind: InspectKind;
        help?: false;
        date?: string;
        hours?: number;
        speaker?: string;
        keyword?: string;
        msgType?: string;
        level?: string;
        limit?: number;
    };

const HISTORY_HEAD = /^(查记录|查聊天记录)(帮助)?(?=\s|$)/u;
const LOG_HEAD = /^(查日志|运行日志|查报错|查失败)(帮助)?(?=\s|$)/u;
const HOURS = /(?:近|最近)\s*(\d{1,3})\s*小时|(\d{1,3})\s*小时内/u;
const LIMIT = /(\d{1,3})\s*条/u;
const SEARCH = /(?:搜|关键词)\s+(\S+)/u;
const DATE = /(?:\d{4}\s*[-年/.]\s*)?\d{1,2}\s*[-月/.]\s*\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}\s*号/u;
const MSG_TYPE: Record<string, string> = {
    图片: 'image',
    图: 'image',
    表情: 'emoji',
    视频: 'video',
    语音: 'voice',
    文字: 'text',
    文本: 'text',
};

function take(pattern: RegExp, text: string): {match: RegExpExecArray; rest: string} | null {
    const match = pattern.exec(text);
    if (!match) return null;
    const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
    return {match, rest: rest.replace(/\s+/gu, ' ').trim()};
}

function parseTail(kind: InspectKind, raw: string): InspectCommand {
    let text = raw.trim();
    if (text === '帮助' || text === 'help') return {kind, help: true};

    let hours: number | undefined;
    let limit: number | undefined;
    let keyword: string | undefined;
    let date: string | undefined;
    let msgType: string | undefined;
    let level: string | undefined;

    const hoursHit = take(HOURS, text);
    if (hoursHit) {
        hours = Number(hoursHit.match[1] || hoursHit.match[2]);
        text = hoursHit.rest;
    }
    const limitHit = take(LIMIT, text);
    if (limitHit) {
        limit = Number(limitHit.match[1]);
        text = limitHit.rest;
    }
    const searchHit = take(SEARCH, text);
    if (searchHit) {
        keyword = searchHit.match[1]?.trim();
        text = searchHit.rest;
    }
    const dateHit = take(DATE, text);
    if (dateHit) {
        date = dateHit.match[0]?.replace(/\s+/gu, ' ').trim();
        text = dateHit.rest;
    }

    const leftover: string[] = [];
    for (const token of text.split(/\s+/u).filter(Boolean)) {
        if (token === '刚才' || token === '刚失败') {
            hours = hours ?? 1;
            continue;
        }
        if (token === '报错' || token === '错误' || token === 'error') {
            level = 'error';
            continue;
        }
        if (token === '警告' || token === 'warn') {
            level = 'warn';
            continue;
        }
        const mapped = MSG_TYPE[token];
        if (mapped) {
            msgType = mapped;
            continue;
        }
        leftover.push(token);
    }

    if (kind === 'log' && hours == null && !date && leftover.length === 0) hours = 1;

    return {
        kind,
        date,
        hours,
        speaker: leftover.join(' ').trim() || undefined,
        keyword,
        msgType,
        level,
        limit,
    };
}

export function parseInspectCommand(raw: string): InspectCommand | null {
    const text = raw.trim();
    if (!text) return null;
    const history = HISTORY_HEAD.exec(text);
    if (history) {
        if (history[2]) return {kind: 'history', help: true};
        return parseTail('history', text.slice(history[0].length));
    }
    const log = LOG_HEAD.exec(text);
    if (log) {
        if (log[2]) return {kind: 'log', help: true};
        const parsed = parseTail('log', text.slice(log[0].length));
        if (log[1] === '查报错' && !parsed.help) parsed.level = parsed.level ?? 'error';
        return parsed;
    }
    return null;
}
