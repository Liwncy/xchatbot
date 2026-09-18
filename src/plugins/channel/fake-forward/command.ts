export type ParsedFakeForwardCommand =
    | {kind: 'help'}
    | {kind: 'script'; title?: string; script: string};

export function parseFakeForwardCommand(command: string): ParsedFakeForwardCommand | null {
    const text = command.trim();
    if (!text.startsWith('伪转发')) return null;
    const rest = text.slice('伪转发'.length).trim();
    if (!rest || rest === '帮助') return {kind: 'help'};

    const lines = rest.split(/\r?\n/u);
    const first = lines[0]?.trim() ?? '';
    if (first.includes('|')) return {kind: 'script', script: rest};
    const script = lines.slice(1).join('\n').trim();
    if (!script) return {kind: 'help'};
    return {kind: 'script', title: first, script};
}
