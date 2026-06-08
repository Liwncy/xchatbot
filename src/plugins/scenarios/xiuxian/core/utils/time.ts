export function normalizeEpochMs(value: number): number {
    if (!Number.isFinite(value)) return 0;
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

export function formatCountdown(ms: number): string {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}天${h}时${m}分${s}秒`;
    return `${h}时${m}分${s}秒`;
}