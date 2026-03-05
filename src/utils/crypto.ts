/**
 * Cryptographic utilities for Cloudflare Workers using the Web Crypto API.
 */

/**
 * Compute SHA-1 hash of the given string and return the hex digest.
 */
export async function sha1Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-1', encoder.encode(data));
  return hexEncode(buffer);
}

/**
 * Compute HMAC-SHA256 of the message using the given key, returning the hex digest.
 */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return hexEncode(buffer);
}

/**
 * Encode an ArrayBuffer as a lowercase hex string.
 */
function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
