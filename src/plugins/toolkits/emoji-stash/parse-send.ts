export type EmojiBracketSendCommand =
    | {type: 'name'; value: string}
    | {type: 'category'; value: string}
    | {type: 'tag'; value: string};

const EMBEDDED_BRACKET_PATTERN = /\[\s*([/#]?)([a-zA-Z0-9_-]+)\s*\]/gu;

function toBracketSendCommand(prefix: string, value: string): EmojiBracketSendCommand {
    const normalized = value.trim().toLowerCase();
    if (prefix === '#') {
        return {type: 'tag', value: normalized};
    }
    if (prefix === '/') {
        return {type: 'category', value: normalized};
    }
    return {type: 'name', value: normalized};
}

/** 从任意文本中提取最后一个 [name]、[/category]、[#tag] 发表情指令。 */
export function extractEmojiBracketSendCommand(content: string): EmojiBracketSendCommand | null {
    const matches = [...content.matchAll(EMBEDDED_BRACKET_PATTERN)];
    if (matches.length === 0) return null;

    const last = matches[matches.length - 1];
    const prefix = last[1] ?? '';
    const value = last[2];
    if (!value?.trim()) return null;

    return toBracketSendCommand(prefix, value);
}

/** 整句仅为 [name]、[/category]、[#tag] 时解析（兼容旧用法）。 */
export function parseEmojiBracketSendCommand(content: string): EmojiBracketSendCommand | null {
    const trimmed = content.trim();
    const command = extractEmojiBracketSendCommand(trimmed);
    if (!command) return null;

    const bracketMatch = trimmed.match(/\[\s*([/#]?)([a-zA-Z0-9_-]+)\s*\]/u);
    if (!bracketMatch) return null;

    const bracketText = bracketMatch[0];
    if (trimmed !== bracketText) return null;

    return command;
}
