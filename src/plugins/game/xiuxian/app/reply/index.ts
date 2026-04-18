export function unknownCommandText(): string {
    return ['❓ 未识别的修仙指令', '💡 发送「修仙帮助」查看完整菜单。'].join('\n');
}

export function cooldownText(actionLabel: string, leftMs: number): string {
    const sec = Math.ceil(leftMs / 1000);
    return `⏳ ${actionLabel}冷却中，请 ${sec}s 后再试。`;
}


