import { describe, it, expect } from 'vitest';
import {
  verifyWechatSignature,
  parseWechatMessage,
  buildWechatReply,
} from '../../src/platforms/wechat/index.js';
import type { ReplyMessage } from '../../src/types/message.js';
import type { WechatPersonalMessage } from '../../src/platforms/wechat/types.js';
import { createHmac } from 'crypto';

function makePayload(overrides: Partial<WechatPersonalMessage> = {}): WechatPersonalMessage {
  return {
    source: 'private',
    messageId: 'msg_001',
    timestamp: 1700000000,
    from: { id: 'wxid_sender', name: 'Sender' },
    self: 'wxid_bot',
    type: 'text',
    content: 'Hello Bot',
    ...overrides,
  };
}

describe('verifyWechatSignature', () => {
  it('returns true for valid HMAC-SHA256 signature', async () => {
    const token = 'test_secret';
    const timestamp = '1700000000';
    const body = '{"type":"text","content":"hello"}';
    const signature = createHmac('sha256', token).update(timestamp + body).digest('hex');

    const result = await verifyWechatSignature(token, signature, timestamp, body);
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    const result = await verifyWechatSignature('token', 'badsignature', '12345', '{}');
    expect(result).toBe(false);
  });
});

describe('parseWechatMessage', () => {
  it('parses private text message', () => {
    const msg = parseWechatMessage(makePayload());
    expect(msg.platform).toBe('wechat');
    expect(msg.type).toBe('text');
    expect(msg.source).toBe('private');
    expect(msg.content).toBe('Hello Bot');
    expect(msg.from).toBe('wxid_sender');
    expect(msg.senderName).toBe('Sender');
    expect(msg.to).toBe('wxid_bot');
    expect(msg.messageId).toBe('msg_001');
  });

  it('parses group text message with room info', () => {
    const msg = parseWechatMessage(makePayload({
      source: 'group',
      room: { id: 'room_123@chatroom', topic: 'Test Group' },
    }));
    expect(msg.source).toBe('group');
    expect(msg.room?.id).toBe('room_123@chatroom');
    expect(msg.room?.topic).toBe('Test Group');
  });

  it('parses official account push', () => {
    const msg = parseWechatMessage(makePayload({
      source: 'official',
      content: 'Official news',
    }));
    expect(msg.source).toBe('official');
    expect(msg.content).toBe('Official news');
  });

  it('parses image message', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'image',
      mediaUrl: 'https://example.com/img.jpg',
    }));
    expect(msg.type).toBe('image');
    expect(msg.mediaId).toBe('https://example.com/img.jpg');
  });

  it('parses voice message', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'voice',
      mediaUrl: 'https://example.com/voice.amr',
    }));
    expect(msg.type).toBe('voice');
    expect(msg.mediaId).toBe('https://example.com/voice.amr');
  });

  it('parses video message', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'video',
      mediaUrl: 'https://example.com/video.mp4',
    }));
    expect(msg.type).toBe('video');
    expect(msg.mediaId).toBe('https://example.com/video.mp4');
  });

  it('parses location message', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'location',
      location: { latitude: 39.9, longitude: 116.4, label: 'Beijing' },
    }));
    expect(msg.type).toBe('location');
    expect(msg.location?.latitude).toBe(39.9);
    expect(msg.location?.longitude).toBe(116.4);
    expect(msg.location?.label).toBe('Beijing');
  });

  it('parses link message', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'link',
      link: { title: 'Test Page', description: 'Desc', url: 'https://example.com' },
    }));
    expect(msg.type).toBe('link');
    expect(msg.link?.title).toBe('Test Page');
    expect(msg.link?.url).toBe('https://example.com');
  });

  it('falls back to text for unknown type', () => {
    const msg = parseWechatMessage(makePayload({
      type: 'unknown_type',
      content: 'some content',
    }));
    expect(msg.type).toBe('text');
    expect(msg.content).toBe('some content');
  });
});

describe('buildWechatReply', () => {
  it('builds text reply JSON for private chat', () => {
    const reply: ReplyMessage = { type: 'text', content: 'Hello User' };
    const result = buildWechatReply(reply, 'wxid_sender');
    expect(result).toEqual({
      to: 'wxid_sender',
      type: 'text',
      content: 'Hello User',
    });
  });

  it('builds text reply JSON for group chat', () => {
    const reply: ReplyMessage = { type: 'text', content: 'Hello Group' };
    const result = buildWechatReply(reply, 'wxid_sender', 'room_123@chatroom');
    expect(result).toEqual({
      to: 'room_123@chatroom',
      type: 'text',
      content: 'Hello Group',
    });
  });

  it('builds image reply JSON', () => {
    const reply: ReplyMessage = { type: 'image', mediaId: 'media_001' };
    const result = buildWechatReply(reply, 'wxid_sender');
    expect(result).toEqual({
      to: 'wxid_sender',
      type: 'image',
      mediaUrl: 'media_001',
    });
  });

  it('builds news reply JSON', () => {
    const reply: ReplyMessage = {
      type: 'news',
      articles: [
        { title: 'Article 1', description: 'Desc 1', url: 'https://example.com/1', picUrl: '' },
        { title: 'Article 2', description: 'Desc 2', url: 'https://example.com/2', picUrl: '' },
      ],
    };
    const result = buildWechatReply(reply, 'wxid_sender');
    expect(result.type).toBe('news');
    expect(result.articles).toHaveLength(2);
  });

  it('returns empty object for unsupported reply type', () => {
    const reply = { type: 'card', cardContent: {} } as ReplyMessage;
    const result = buildWechatReply(reply, 'wxid_sender');
    expect(result).toEqual({});
  });
});
