/**
 * 生成随机公网 IPv4 地址，并构造一组用于欺骗代理识别的 HTTP 请求头。
 *
 * 过滤范围（RFC 保留 / 私有网段）：
 *   0.x.x.x  · 10.x.x.x  · 127.x.x.x  · 169.254.x.x
 *   172.16-31.x.x  · 192.168.x.x  · 224.x.x.x+（组播 / 保留）
 */

/** 返回 [min, max] 范围内的随机整数（含两端） */
function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 判断首两段是否落入保留网段 */
function isReserved(a: number, b: number): boolean {
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

/**
 * 生成一个随机公网 IPv4 地址。
 * 循环采样直到不落入保留段为止（期望循环次数 < 2）。
 */
export function randomPublicIPv4(): string {
    let a: number;
    let b: number;
    do {
        a = randInt(1, 254);
        b = randInt(0, 255);
    } while (isReserved(a, b));

    const c = randInt(0, 255);
    const d = randInt(1, 254);
    return `${a}.${b}.${c}.${d}`;
}

/**
 * 构造一组伪造来源 IP 的 HTTP 请求头。
 *
 * @param ip 指定使用的 IP；省略时自动生成随机公网 IP。
 * @returns 可直接合并进 fetch Headers 的普通对象。
 */
export function buildSpoofIPHeaders(ip?: string): Record<string, string> {
    const addr = ip ?? randomPublicIPv4();
    return {
        'X-Forwarded-For': addr,
        'X-Real-IP': addr,
        'Client-IP': addr,
        'X-Client-IP': addr,
        'X-Forwarded': addr,
        'Forwarded-For': addr,
        'Forwarded': `for=${addr}`,
    };
}

