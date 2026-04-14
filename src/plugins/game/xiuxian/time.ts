export function normalizeEpochMs(value: number): number {
    if (!Number.isFinite(value)) return 0;
    // Treat 10-digit unix timestamp as seconds; keep 13-digit as milliseconds.
    if (value > 0 && value < 100000000000) return Math.trunc(value * 1000);
    return Math.trunc(value);
}

export function formatBeijingTime(value: number): string {
    const ts = normalizeEpochMs(value);
    if (!ts) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date(ts));
}

