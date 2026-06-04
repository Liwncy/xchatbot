import {hmacSha256Hex} from '../../utils/crypto.js';

/**
 * 验证微信网关的 Webhook 签名。
 * 使用 HMAC-SHA256(timestamp + body, token) 进行认证。
 */
export async function verifyWechatSignature(
    token: string,
    signature: string,
    timestamp: string,
    body: string,
): Promise<boolean> {
    const expected = await hmacSha256Hex(token, timestamp + body);
    return expected === signature;
}

