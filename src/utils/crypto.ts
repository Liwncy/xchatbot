/**
 * 基于 Web Crypto API 的加密工具，适用于 Cloudflare Workers 环境。
 */

/**
 * 计算给定字符串的 SHA-1 哈希值，返回十六进制摘要。
 */
export async function sha1Hex(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-1', encoder.encode(data));
    return hexEncode(buffer);
}

/**
 * 使用给定密钥对消息计算 HMAC-SHA256，返回十六进制摘要。
 */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['sign'],
    );
    const buffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return hexEncode(buffer);
}

/**
 * 将 ArrayBuffer 编码为小写十六进制字符串。
 */
function hexEncode(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
