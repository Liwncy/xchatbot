export function parseBool(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭', '禁用'].includes(normalized)) return false;
    return fallback;
}
