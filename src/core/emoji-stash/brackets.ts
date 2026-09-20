export type EmojiBracketCommand =
    | {type: 'name'; value: string}
    | {type: 'category'; value: string}
    | {type: 'tag'; value: string};

const BRACKET = /\[\s*([/#]?)([^\]\s]{1,16})\s*\]/gu;
const TOKEN = /^(?:[\u4e00-\u9fff]+|[a-z0-9][a-z0-9_-]*)$/u;

function toCommand(prefix: string, raw: string): EmojiBracketCommand | null {
    const value = raw.trim();
    if (!TOKEN.test(value.toLowerCase()) && !/[\u4e00-\u9fff]/u.test(value)) return null;
    if (prefix === '#') return {type: 'tag', value};
    if (prefix === '/') return {type: 'category', value};
    return {type: 'name', value};
}

/** 从正文里取最后一个 [名字]、[/分类]、[#标签]。 */
export function extractEmojiBracketCommand(content: string): EmojiBracketCommand | null {
    const matches = [...content.matchAll(BRACKET)];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        const prefix = matches[index]?.[1] ?? '';
        const value = matches[index]?.[2] ?? '';
        const command = toCommand(prefix, value);
        if (command) return command;
    }
    return null;
}
