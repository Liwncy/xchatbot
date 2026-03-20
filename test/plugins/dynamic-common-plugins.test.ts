import {describe, it, expect, vi, afterEach} from 'vitest';
import {dynamicCommonPluginsEngine} from '../../src/plugins/common/dynamic.js';
import type {IncomingMessage, Env} from '../../src/types/message.js';

type DynamicTestEnv = Env & {COMMON_DYNAMIC_PLUGINS_CLIENT_ID?: string};

function makeMessage(content: string): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from: 'wxid_user',
        to: 'wxid_bot',
        timestamp: 1700000000,
        messageId: 'msg_001',
        content,
        raw: {},
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('dynamicCommonPluginsEngine', () => {
    it('supports prefix + tail args for weather query', async () => {
        const env: DynamicTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/advanced-rules-weather',
            COMMON_DYNAMIC_PLUGINS_CLIENT_ID: 'dynamic-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        name: 'weather',
                        keyword: '天气',
                        matchMode: 'prefix',
                        args: {mode: 'tail', names: ['city'], required: ['city']},
                        url: 'https://api.example.com/weather?city={{city}}',
                        mode: 'json',
                        jsonPath: '$.result',
                        rType: 'text',
                    },
                ]), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({result: '北京 晴 10~18C'}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            );

        const reply = await dynamicCommonPluginsEngine.handle(makeMessage('天气 北京'), env);

        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('北京 晴 10~18C');
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://config.example.com/advanced-rules-weather',
            {method: 'GET', headers: {clientid: 'dynamic-client-id'}},
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.example.com/weather?city=%E5%8C%97%E4%BA%AC',
            {method: 'GET', headers: undefined},
        );
    });

    it('supports split args for multi-parameter request body', async () => {
        const env: DynamicTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/advanced-rules-fx',
            COMMON_DYNAMIC_PLUGINS_CLIENT_ID: 'dynamic-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        name: 'fx',
                        keyword: '汇率',
                        matchMode: 'prefix',
                        args: {mode: 'split', names: ['from', 'to'], required: ['from', 'to']},
                        url: 'https://api.example.com/fx',
                        method: 'POST',
                        headers: {Authorization: 'Bearer {{1}}-{{2}}'},
                        body: {from: '{{from}}', to: '{{to}}'},
                        mode: 'json',
                        jsonPath: '$.rate',
                        rType: 'text',
                    },
                ]), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({rate: '7.22'}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            );

        const reply = await dynamicCommonPluginsEngine.handle(makeMessage('汇率 USD CNY'), env);

        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('7.22');
        expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://config.example.com/advanced-rules-fx', {
            method: 'GET',
            headers: {clientid: 'dynamic-client-id'},
        });
        expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.example.com/fx', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer USD-CNY',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({from: 'USD', to: 'CNY'}),
        });
    });

    it('returns null when required args are missing', async () => {
        const env: DynamicTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/advanced-rules-required',
            COMMON_DYNAMIC_PLUGINS_CLIENT_ID: 'dynamic-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify([
                {
                    keyword: '天气',
                    matchMode: 'prefix',
                    args: {mode: 'tail', names: ['city'], required: ['city']},
                    url: 'https://api.example.com/weather?city={{city}}',
                    mode: 'text',
                    rType: 'text',
                },
            ]), {
                status: 200,
                headers: {'Content-Type': 'application/json'},
            }),
        );
        const reply = await dynamicCommonPluginsEngine.handle(makeMessage('天气'), env);

        expect(reply).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('supports pipe aliases when keyword is an array item', async () => {
        const env: DynamicTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/dynamic-rules-alias',
            COMMON_DYNAMIC_PLUGINS_CLIENT_ID: 'dynamic-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        name: 'moyu-alias',
                        keyword: ['摸鱼日报|今日摸鱼|上班日报'],
                        url: 'https://api.example.com/moyu',
                        mode: 'text',
                        rType: 'text',
                    },
                ]), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            )
            .mockResolvedValueOnce(new Response('摸鱼快乐', {status: 200}));

        const reply = await dynamicCommonPluginsEngine.handle(makeMessage('上班日报'), env);

        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('摸鱼快乐');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

});


