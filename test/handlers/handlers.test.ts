import { describe, it, expect } from 'vitest';
import { handleTextMessage } from '../../src/handlers/text-handler.js';
import { handleEventMessage } from '../../src/handlers/event-handler.js';
import { handleLocationMessage } from '../../src/handlers/location-handler.js';
import { handleLinkMessage } from '../../src/handlers/link-handler.js';
import type { IncomingMessage, Env } from '../../src/types/message.js';

const env: Env = {};

function makeMessage(overrides: Partial<IncomingMessage>): IncomingMessage {
  return {
    platform: 'wechat',
    type: 'text',
    from: 'user_001',
    to: 'bot_001',
    timestamp: 1700000000,
    messageId: 'msg_001',
    raw: {},
    ...overrides,
  };
}

describe('handleTextMessage', () => {
  it('returns help message for "帮助"', async () => {
    const reply = await handleTextMessage(makeMessage({ content: '帮助' }), env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('帮助');
  });

  it('returns help message for "help"', async () => {
    const reply = await handleTextMessage(makeMessage({ content: 'help' }), env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('帮助');
  });

  it('returns about message for "关于"', async () => {
    const reply = await handleTextMessage(makeMessage({ content: '关于' }), env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('Cloudflare');
  });

  it('echoes unknown text messages', async () => {
    const reply = await handleTextMessage(makeMessage({ content: 'hello world' }), env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('hello world');
  });
});

describe('handleEventMessage', () => {
  it('returns welcome message on subscribe', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'subscribe' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply?.type).toBe('text');
    expect((reply as { content: string }).content).toContain('感谢');
  });

  it('returns null on unsubscribe', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'unsubscribe' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply).toBeNull();
  });

  it('returns scan message for scan events', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'scan', key: 'scene_001' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply?.type).toBe('text');
    expect((reply as { content: string }).content).toContain('scene_001');
  });

  it('returns click message for click events', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'click', key: 'menu_001' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply?.type).toBe('text');
    expect((reply as { content: string }).content).toContain('menu_001');
  });

  it('returns null for view events', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'view' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply).toBeNull();
  });

  it('returns null for unknown events', async () => {
    const msg = makeMessage({ type: 'event', event: { type: 'unknown' } });
    const reply = await handleEventMessage(msg, env);
    expect(reply).toBeNull();
  });
});

describe('handleLocationMessage', () => {
  it('returns location info', async () => {
    const msg = makeMessage({
      type: 'location',
      location: { latitude: 39.9, longitude: 116.4, label: 'Beijing' },
    });
    const reply = await handleLocationMessage(msg, env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('39.9');
    expect(reply.content).toContain('116.4');
    expect(reply.content).toContain('Beijing');
  });

  it('handles missing location gracefully', async () => {
    const msg = makeMessage({ type: 'location' });
    const reply = await handleLocationMessage(msg, env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('解析失败');
  });
});

describe('handleLinkMessage', () => {
  it('returns link info', async () => {
    const msg = makeMessage({
      type: 'link',
      link: { title: 'Test Page', description: 'Desc', url: 'https://example.com' },
    });
    const reply = await handleLinkMessage(msg, env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('Test Page');
    expect(reply.content).toContain('https://example.com');
  });

  it('handles missing link gracefully', async () => {
    const msg = makeMessage({ type: 'link' });
    const reply = await handleLinkMessage(msg, env);
    expect(reply.type).toBe('text');
    expect(reply.content).toContain('解析失败');
  });
});
