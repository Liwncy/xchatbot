import {describe, it, expect, vi, afterEach} from 'vitest';
import {workflowCommonPluginsEngine} from '../../src/plugins/common/workflow.js';
import type {IncomingMessage, Env} from '../../src/types/message.js';

type WorkflowTestEnv = Env & {COMMON_WORKFLOW_PLUGINS_CLIENT_ID?: string};

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

describe('workflowCommonPluginsEngine', () => {
    it('supports multi-step workflow requests', async () => {
        const env: WorkflowTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/workflow-rules',
            COMMON_WORKFLOW_PLUGINS_CLIENT_ID: 'workflow-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify([
                    {
                        name: 'weather-workflow',
                        keyword: '天气详情',
                        matchMode: 'prefix',
                        args: {mode: 'tail', names: ['city'], required: ['city']},
                        mode: 'workflow',
                        rType: 'text',
                        outputFrom: 'finalText',
                        steps: [
                            {
                                name: 'city-code',
                                url: 'https://api.example.com/city-code?name={{city}}',
                                mode: 'json',
                                jsonPath: '$.data.code',
                                saveAs: 'cityCode',
                            },
                            {
                                name: 'weather',
                                url: 'https://api.example.com/weather?code={{cityCode}}',
                                mode: 'json',
                                jsonPath: '$.data.summary',
                                saveAs: 'finalText',
                            },
                        ],
                    },
                ]), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({data: {code: '101010100'}}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({data: {summary: '北京 多云 10~18C'}}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                }),
            );

        const reply = await workflowCommonPluginsEngine.handle(makeMessage('天气详情 北京'), env);

        expect(reply).not.toBeNull();
        expect((reply as { type: string }).type).toBe('text');
        expect((reply as { content: string }).content).toBe('北京 多云 10~18C');
        expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://config.example.com/workflow-rules', {
            method: 'GET',
            headers: {clientid: 'workflow-client-id'},
        });
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.example.com/city-code?name=%E5%8C%97%E4%BA%AC',
            {method: 'GET', headers: undefined},
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'https://api.example.com/weather?code=101010100',
            {method: 'GET', headers: undefined},
        );
    });

    it('returns null when workflow required args are missing', async () => {
        const env: WorkflowTestEnv = {
            COMMON_PLUGINS_CONFIG_URL: 'https://config.example.com/workflow-rules-required',
            COMMON_WORKFLOW_PLUGINS_CLIENT_ID: 'workflow-client-id',
        };

        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify([
                {
                    keyword: '天气详情',
                    matchMode: 'prefix',
                    args: {mode: 'tail', names: ['city'], required: ['city']},
                    mode: 'workflow',
                    rType: 'text',
                    steps: [
                        {
                            url: 'https://api.example.com/city-code?name={{city}}',
                            mode: 'json',
                            jsonPath: '$.data.code',
                        },
                    ],
                },
            ]), {
                status: 200,
                headers: {'Content-Type': 'application/json'},
            }),
        );

        const reply = await workflowCommonPluginsEngine.handle(makeMessage('天气详情'), env);
        expect(reply).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

