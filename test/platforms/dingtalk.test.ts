import { describe, it, expect } from 'vitest';
import { parseDingTalkMessage, verifyDingTalkSignature } from '../../src/platforms/dingtalk/index.js';
import type { DingTalkMessage } from '../../src/platforms/dingtalk/types.js';

describe('verifyDingTalkSignature', () => {
  it('returns true for valid Base64-encoded signature', async () => {
    // Pre-compute expected signature using Node's crypto
    const { createHmac } = await import('crypto');
    const secret = 'mysecret';
    const timestamp = '1700000000000';
    const message = `${timestamp}\n${secret}`;
    const hmacBuffer = createHmac('sha256', secret).update(message).digest();
    const base64Sig = Buffer.from(hmacBuffer).toString('base64');
    // URL-encode it as DingTalk would send
    const urlEncodedSig = encodeURIComponent(base64Sig);

    const result = await verifyDingTalkSignature(secret, timestamp, urlEncodedSig);
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    const result = await verifyDingTalkSignature('secret', '12345', 'invalidsig');
    expect(result).toBe(false);
  });
});

describe('parseDingTalkMessage', () => {
  it('parses text message', () => {
    const msg: DingTalkMessage = {
      msgtype: 'text',
      msgId: 'msg_001',
      createAt: 1700000000000,
      senderId: 'user_001',
      senderNick: 'Test User',
      robotCode: 'bot_001',
      sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
      text: { content: 'Hello DingTalk Bot' },
    };

    const result = parseDingTalkMessage(msg);
    expect(result.platform).toBe('dingtalk');
    expect(result.type).toBe('text');
    expect(result.content).toBe('Hello DingTalk Bot');
    expect(result.from).toBe('user_001');
    expect(result.to).toBe('bot_001');
    expect(result.messageId).toBe('msg_001');
  });

  it('parses picture message', () => {
    const msg: DingTalkMessage = {
      msgtype: 'picture',
      msgId: 'msg_002',
      createAt: 1700000000000,
      senderId: 'user_001',
      robotCode: 'bot_001',
      sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
      picture: { downloadCode: 'pic_code_001' },
    };

    const result = parseDingTalkMessage(msg);
    expect(result.type).toBe('image');
    expect(result.mediaId).toBe('pic_code_001');
  });

  it('parses audio message', () => {
    const msg: DingTalkMessage = {
      msgtype: 'audio',
      msgId: 'msg_003',
      createAt: 1700000000000,
      senderId: 'user_001',
      robotCode: 'bot_001',
      sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
      audio: { downloadCode: 'audio_code_001', duration: '10' },
    };

    const result = parseDingTalkMessage(msg);
    expect(result.type).toBe('voice');
    expect(result.mediaId).toBe('audio_code_001');
  });

  it('uses current timestamp when createAt is absent', () => {
    const before = Math.floor(Date.now() / 1000);
    const msg: DingTalkMessage = {
      msgtype: 'text',
      text: { content: 'test' },
    };
    const result = parseDingTalkMessage(msg);
    const after = Math.floor(Date.now() / 1000);
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});
