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
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
