import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {commonPluginsEngine} from '../../src/plugins/common/base.js';
import type {IncomingMessage, Env} from '../../src/types/message.js';

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
                        data: {image_url: 'https://cdn.example.com/wife.webp'},
                    }),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            )
            .mockResolvedValueOnce(
                new Response(fakeImageBytes, {status: 200, headers: {'Content-Type': 'image/webp'}}),
            );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '请来个老婆图'}), env);
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

        globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('hello from api', {status: 200}));

        const reply = await commonPluginsEngine.handle(makeMessage({content: '我要看菜单'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toContain('hello from api');
    });

    it('supports pipe-separated aliases in keyword string', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '摸鱼日报|今日摸鱼|上班日报',
                    url: 'https://api.example.com/moyu',
                    mode: 'text',
                    rType: 'text',
                },
            ]),
        };

        globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('摸鱼快乐', {status: 200}));

        const reply = await commonPluginsEngine.handle(makeMessage({content: '今日摸鱼'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toContain('摸鱼快乐');
    });

    it('supports jsonPath array random index with [x]', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '随机一句',
                    url: 'https://api.example.com/random-list',
                    mode: 'json',
                    jsonPath: '$.data.list[x]',
                    rType: 'text',
                },
            ]),
        };

        vi.spyOn(Math, 'random').mockReturnValue(0.6); // 3 项数组会命中索引 1
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({data: {list: ['first', 'second', 'third']}}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '来个随机一句'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('second');
    });

    it('supports jsonPath concatenation with +', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '拼接地址',
                    url: 'https://api.example.com/addr',
                    mode: 'json',
                    jsonPath: '$.data.province + "-" + $.data.city',
                    rType: 'text',
                },
            ]),
        };

        globalThis.fetch = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({data: {province: '北京', city: '朝阳'}}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '拼接地址'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('北京-朝阳');
    });

    it('supports jsonPath sibling list with comma', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '并列字段',
                    url: 'https://api.example.com/fields',
                    mode: 'json',
                    jsonPath: '$.data.a,$.data.b',
                    rType: 'text',
                },
            ]),
        };

        globalThis.fetch = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({data: {a: 'A', b: 'B'}}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '并列字段'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('["A","B"]');
    });

    it('supports auto array matching without index in jsonPath', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '油价标题',
                    url: 'https://api.example.com/oil',
                    mode: 'json',
                    jsonPath: '$.prices.title',
                    rType: 'text',
                },
            ]),
        };

        globalThis.fetch = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    prices: [
                        {title: '山东92#汽油', price: '7.60'},
                        {title: '山东95#汽油', price: '8.15'},
                    ],
                }),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '油价标题'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('["山东92#汽油","山东95#汽油"]');
    });

    it('supports lines() in jsonPath for array object formatting', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    keyword: '山东油价',
                    url: 'https://api.example.com/oil-price',
                    mode: 'json',
                    jsonPath: "$.city + $.tips + ':\\n' + lines($.prices,'{title}:{price}')",
                    rType: 'text',
                },
            ]),
        };

        globalThis.fetch = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    data: 200,
                    city: '山东',
                    tips: '下次油价3月23日24时调整',
                    prices: [
                        {title: '山东92#汽油', price: '7.60'},
                        {title: '山东95#汽油', price: '8.15'},
                        {title: '山东98#汽油', price: '9.15'},
                        {title: '山东0#柴油', price: '7.21'},
                    ],
                }),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '查山东油价'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe(
            '山东下次油价3月23日24时调整:\n' +
            '山东92#汽油:7.60\n' +
            '山东95#汽油:8.15\n' +
            '山东98#汽油:9.15\n' +
            '山东0#柴油:7.21',
        );
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

        const reply = await commonPluginsEngine.handle(makeMessage({content: '没有命中'}), env);
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
            new Response('data:image/png;base64,QUJDRA==', {status: 200}),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '请发图'}), env);
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
                JSON.stringify({data: ['https://cdn.example.com/yht.jpg']}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        globalThis.fetch = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({data: ['https://cdn.example.com/yht.jpg']}),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            )
            .mockResolvedValueOnce(
                new Response(fakeImageBytes, {status: 200, headers: {'Content-Type': 'image/jpeg'}}),
            );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '我黄某人与赌毒不共戴天'}), env);
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
                    JSON.stringify({data: {image_url: 'https://cdn.example.com/a.png'}}),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            )
            .mockResolvedValueOnce(
                new Response(fakeImageBytes, {status: 200, headers: {'Content-Type': 'image/png'}}),
            );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '测试图片'}), env);
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
                    JSON.stringify({data: {video: 'https://cdn.example.com/a.mp4'}}),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            )
            .mockResolvedValueOnce(
                new Response(fakeVideoBytes, {status: 200, headers: {'Content-Type': 'video/mp4'}}),
            );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '测试视频'}), env);
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
                JSON.stringify({data: 'https://example.com/article'}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '请发链接'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('news');
        expect((reply as {
            articles: Array<{ url?: string; title: string }>
        }).articles[0].url).toBe('https://example.com/article');
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
                JSON.stringify({data: 'https://example.com/zrn'}),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await commonPluginsEngine.handle(makeMessage({content: '来个章若楠'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('news');
        expect((reply as { articles: Array<{ title: string; description: string }> }).articles[0].title).toBe('章若楠');
        expect((reply as {
            articles: Array<{ title: string; description: string }>
        }).articles[0].description).toBe('章若楠的链接');
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

        const reply = await commonPluginsEngine.handle(makeMessage({content: '来个小哥哥视频'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('news');
        expect((reply as {
            articles: Array<{ url: string; title: string; description: string }>
        }).articles[0].url).toBe('http://api.yujn.cn/api/xgg.php?type=video');
        expect((reply as {
            articles: Array<{ url: string; title: string; description: string }>
        }).articles[0].title).toBe('小哥哥视频');
        expect((reply as {
            articles: Array<{ url: string; title: string; description: string }>
        }).articles[0].description).toBe('小哥哥视频的链接');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('loads rules from remote config API with clientid header', async () => {
        const env: Env = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/common/plugins/config',
            COMMON_PLUGINS_CLIENT_ID: '6e64c2eeb9c6716965a67a6f8d3879e0',
        };

        globalThis.fetch = vi.fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify([
                        {
                            keyword: '远程菜单',
                            url: 'https://api.example.com/remote-menu',
                            mode: 'text',
                            rType: 'text',
                        },
                    ]),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            )
            .mockResolvedValueOnce(new Response('remote menu ok', {status: 200}));

        const reply = await commonPluginsEngine.handle(makeMessage({content: '看看远程菜单'}), env);
        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toContain('remote menu ok');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(
            1,
            'https://config.example.com/common/plugins/config',
            {
                method: 'GET',
                headers: {clientid: '6e64c2eeb9c6716965a67a6f8d3879e0'},
            },
        );
    });
});
