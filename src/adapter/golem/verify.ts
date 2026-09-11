import {hmacSha256Hex} from '../../utils/crypto.js';

export async function verifyWechatSignature(
    token: string,
    signature: string,
    timestamp: string,
    body: string,
): Promise<boolean> {
    const expected = await hmacSha256Hex(token, timestamp + body);
    return expected === signature;
}
