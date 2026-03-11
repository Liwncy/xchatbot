import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { commonPluginsEngine } from '../../src/plugins/common-plugins.js';
import type { IncomingMessage, Env } from '../../src/types/message.js';

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

describe('commonPluginsEngine', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns image reply by extracting jsonPath in json mode', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          name: 'wife-image',
          keyword: '来个老婆',
          url: 'https://api.example.com/wife',
          mode: 'json',
          jsonPath: '$.data.image_url',
          rType: 'image',
        },
      ]),
    };

    const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: { image_url: 'https://cdn.example.com/wife.webp' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(fakeImageBytes, { status: 200, headers: { 'Content-Type': 'image/webp' } }),
      );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '请来个老婆图' }), env);
    expect(reply).not.toBeNull();
    expect(Array.isArray(reply)).toBe(false);
    expect((reply as { type: string }).type).toBe('image');
    expect((reply as { mediaId: string }).mediaId).toBeTruthy();
  });

  it('returns text reply in text mode', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: ['菜单', 'help'],
          url: 'https://api.example.com/menu',
          mode: 'text',
          rType: 'text',
        },
      ]),
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('hello from api', { status: 200 }));

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '我要看菜单' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('text');
    expect((reply as { content: string }).content).toContain('hello from api');
  });

  it('returns null when no rule matches keyword', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '触发词A',
          url: 'https://api.example.com/a',
          mode: 'text',
          rType: 'text',
        },
      ]),
    };

    globalThis.fetch = vi.fn();

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '没有命中' }), env);
    expect(reply).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('strips data-url prefix in base64 mode', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '发图',
          url: 'https://api.example.com/base64',
          mode: 'base64',
          rType: 'image',
        },
      ]),
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('data:image/png;base64,QUJDRA==', { status: 200 }),
    );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '请发图' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('image');
    expect((reply as { mediaId: string }).mediaId).toBe('QUJDRA==');
  });

  it('supports COMMON_PLUGINS_MAPPING with legacy keywordMapping + fileType + base mode', async () => {
    const env: Env = {
      COMMON_PLUGINS_MAPPING: JSON.stringify({
        keywordMapping: [
          {
            keyword: '我与赌毒不共戴天|我黄某人与赌毒不共戴天',
            url: 'http://api.yujn.cn/api/yht.php?type=json',
            mode: 'json',
            jsonPath: '$.data[0]',
            fileType: 'image',
          },
          {
            keyword: '腹肌图片',
            url: 'http://api.yujn.cn/api/fujiimg.php',
            mode: 'base',
            fileType: 'image',
          },
        ],
      }),
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: ['https://cdn.example.com/yht.jpg'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: ['https://cdn.example.com/yht.jpg'] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(fakeImageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
      );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '我黄某人与赌毒不共戴天' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('image');
    expect((reply as { mediaId: string }).mediaId).toBeTruthy();
  });

  it('downloads image url in json mode and returns base64 mediaId', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '测试图片',
          url: 'https://api.example.com/photo-json',
          mode: 'json',
          jsonPath: '$.data.image_url',
          rType: 'image',
        },
      ]),
    };

    const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { image_url: 'https://cdn.example.com/a.png' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(fakeImageBytes, { status: 200, headers: { 'Content-Type': 'image/png' } }),
      );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '测试图片' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('image');
    expect((reply as { mediaId: string }).mediaId).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('downloads video url in json mode and returns base64 mediaId', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '测试视频',
          url: 'https://api.example.com/video-json',
          mode: 'json',
          jsonPath: '$.data.video',
          rType: 'video',
        },
      ]),
    };

    const fakeVideoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { video: 'https://cdn.example.com/a.mp4' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(fakeVideoBytes, { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
      );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '测试视频' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('video');
    expect((reply as { mediaId: string }).mediaId).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns link reply (news) when rType is link', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '发链接',
          url: 'https://api.example.com/link',
          mode: 'json',
          jsonPath: '$.data',
          rType: 'link',
          linkTitle: '示例链接',
          linkDescription: '这是一个示例链接',
        },
      ]),
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: 'https://example.com/article' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '请发链接' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('news');
    expect((reply as { articles: Array<{ url?: string; title: string }> }).articles[0].url).toBe('https://example.com/article');
    expect((reply as { articles: Array<{ url?: string; title: string }> }).articles[0].title).toBe('示例链接');
  });

  it('uses keyword as default link title/description when link fields are missing', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '章若楠',
          url: 'https://api.example.com/link-defaults',
          mode: 'json',
          jsonPath: '$.data',
          rType: 'link',
        },
      ]),
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: 'https://example.com/zrn' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '来个章若楠' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('news');
    expect((reply as { articles: Array<{ title: string; description: string }> }).articles[0].title).toBe('章若楠');
    expect((reply as { articles: Array<{ title: string; description: string }> }).articles[0].description).toBe('章若楠的链接');
  });

  it('skips fetch and uses rule.url directly when mode is base64 and rType is link', async () => {
    const env: Env = {
      COMMON_PLUGINS_CONFIG: JSON.stringify([
        {
          keyword: '小哥哥视频',
          url: 'http://api.yujn.cn/api/xgg.php?type=video',
          mode: 'base64',
          rType: 'link',
        },
      ]),
    };

    globalThis.fetch = vi.fn();

    const reply = await commonPluginsEngine.handle(makeMessage({ content: '来个小哥哥视频' }), env);
    expect(reply).not.toBeNull();
    expect((reply as { type: string }).type).toBe('news');
    expect((reply as { articles: Array<{ url: string; title: string; description: string }> }).articles[0].url).toBe('http://api.yujn.cn/api/xgg.php?type=video');
    expect((reply as { articles: Array<{ url: string; title: string; description: string }> }).articles[0].title).toBe('小哥哥视频');
    expect((reply as { articles: Array<{ url: string; title: string; description: string }> }).articles[0].description).toBe('小哥哥视频的链接');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
