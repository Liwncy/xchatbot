export type DistributionCommand =
    | {kind: 'help'}
    | {kind: 'list'}
    | {kind: 'show'; name: string}
    | {kind: 'create'; values: Record<string, string>}
    | {kind: 'status'; name: string; active: boolean}
    | {kind: 'delete'; name: string}
    | {kind: 'content'; name: string; values: Record<string, string>}
    | {kind: 'test'; name: string};

function unquote(value: string): string {
    const raw = value.trim();
    if (raw.length >= 2 && (
        (raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith("'") && raw.endsWith("'"))
    )) {
        return raw.slice(1, -1).replace(/\\(["'\\])/gu, '$1');
    }
    return raw;
}

export function parseKeyValues(text: string): Record<string, string> {
    const values: Record<string, string> = {};
    const pattern = /([\p{L}\w]+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/gu;
    for (const match of text.matchAll(pattern)) {
        values[match[1]] = unquote(match[2]);
    }
    return values;
}

function splitNameAndValues(text: string): {name: string; values: Record<string, string>} {
    const firstKey = text.search(/[\p{L}\w]+=/u);
    if (firstKey < 0) return {name: text.trim(), values: {}};
    return {
        name: text.slice(0, firstKey).trim(),
        values: parseKeyValues(text.slice(firstKey)),
    };
}

export function parseDistributionCommand(command: string): DistributionCommand | null {
    const match = command.trim().match(/^分发规则(?:\s+([\s\S]*))?$/u);
    if (!match) return null;
    const body = match[1]?.trim() ?? '';
    if (!body || body === '帮助') return {kind: 'help'};
    if (body === '列表') return {kind: 'list'};

    const create = body.match(/^新增(?:\s+([\s\S]+))?$/u);
    if (create) return {kind: 'create', values: parseKeyValues(create[1] ?? '')};

    const content = body.match(/^内容(?:\s+([\s\S]+))?$/u);
    if (content) {
        const parsed = splitNameAndValues(content[1] ?? '');
        return {kind: 'content', ...parsed};
    }

    const actions: Array<[RegExp, DistributionCommand['kind']]> = [
        [/^查看(?:\s+(.+))$/u, 'show'],
        [/^启用(?:\s+(.+))$/u, 'status'],
        [/^停用(?:\s+(.+))$/u, 'status'],
        [/^删除(?:\s+(.+))$/u, 'delete'],
        [/^测试(?:\s+(.+))$/u, 'test'],
    ];
    for (const [pattern, kind] of actions) {
        const action = body.match(pattern);
        if (!action?.[1]) continue;
        const name = action[1].trim();
        if (kind === 'show') return {kind, name};
        if (kind === 'delete') return {kind, name};
        if (kind === 'test') return {kind, name};
        return {kind: 'status', name, active: body.startsWith('启用')};
    }
    return {kind: 'help'};
}
