import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiPlugin } from '../../src/plugins/ai';
import type { IncomingMessage, Env } from '../../src/types/message.js';

const env: Env = {
  AI_API_URL: 'https://api.example.com/chat',
  AI_API_KEY: 'test-key',
  AI_MODEL: 'test-model',
};

function makeMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
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

function expectTextReply(reply: unknown): { type: 'text'; content: string } {
  expect(reply).not.toBeNull();
  expect(Array.isArray(reply)).toBe(false);
  expect((reply as { type?: string }).type).toBe('text');
  return reply as { type: 'text'; content: string };
}

describe('aiPlugin', () => {
  describe('match', () => {
    it('matches text containing "小聪明儿"', () => {
      expect(aiPlugin.match('小聪明儿，今天天气如何？', makeMessage())).toBe(true);
    });

    it('does not match unrelated text', () => {
      expect(aiPlugin.match('你好', makeMessage())).toBe(false);
    });
  });

  describe('handle', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns AI text when choices[0].message.content exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '你好呀，我在呢。' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const reply = await aiPlugin.handle(makeMessage({ content: '小聪明儿，在吗' }), env);
      const textReply = expectTextReply(reply);
      expect(textReply.content).toBe('你好呀，我在呢。');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns fallback when AI_API_URL is missing', async () => {
      const reply = await aiPlugin.handle(makeMessage({ content: '小聪明儿，讲个笑话' }), {});
      const textReply = expectTextReply(reply);
      expect(textReply.content).toContain('AI_API_URL');
    });

    it('returns fallback on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

      const reply = await aiPlugin.handle(makeMessage({ content: '小聪明儿，讲个故事' }), env);
      const textReply = expectTextReply(reply);
      expect(textReply.content).toContain('不可用');
    });

    it('returns fallback when response has no supported content shape', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const reply = await aiPlugin.handle(makeMessage({ content: '小聪明儿，写首诗' }), env);
      const textReply = expectTextReply(reply);
      expect(textReply.content).toContain('可用内容');
    });
  });
});
