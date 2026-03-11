import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { catImagePlugin } from '../../src/plugins/cat-image.js';
import type { IncomingMessage, Env } from '../../src/types/message.js';

const env: Env = {};

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

describe('catImagePlugin', () => {
  describe('match', () => {
    it('matches text containing "看看猫咪"', () => {
      expect(catImagePlugin.match('看看猫咪')).toBe(true);
    });

    it('matches text with "看看猫咪" embedded in a sentence', () => {
      expect(catImagePlugin.match('我想看看猫咪吧')).toBe(true);
    });

    it('does not match unrelated text', () => {
      expect(catImagePlugin.match('你好')).toBe(false);
    });

    it('does not match empty text', () => {
      expect(catImagePlugin.match('')).toBe(false);
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

    it('returns an image reply on success', async () => {
      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ url: 'https://cdn.example.com/cat.png' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(fakeImageBytes, {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          }),
        );

      const reply = await catImagePlugin.handle(makeMessage({ content: '看看猫咪' }), env);
      expect(reply).not.toBeNull();
      expect(reply!.type).toBe('image');
      expect((reply as { mediaId: string }).mediaId).toBeTruthy();

      // Verify both API and image fetches were called
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns null and logs error when cat API returns non-ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response('Server Error', { status: 500 }),
      );

      const reply = await catImagePlugin.handle(makeMessage({ content: '看看猫咪' }), env);
      expect(reply).toBeNull();
    });

    it('returns null and logs error when cat API returns empty array', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const reply = await catImagePlugin.handle(makeMessage({ content: '看看猫咪' }), env);
      expect(reply).toBeNull();
    });

    it('returns null and logs error when image download fails', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ url: 'https://cdn.example.com/cat.png' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('Not Found', { status: 404 }),
        );

      const reply = await catImagePlugin.handle(makeMessage({ content: '看看猫咪' }), env);
      expect(reply).toBeNull();
    });

    it('returns null and logs error when fetch throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const reply = await catImagePlugin.handle(makeMessage({ content: '看看猫咪' }), env);
      expect(reply).toBeNull();
    });
  });
});
