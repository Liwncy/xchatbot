import assert from 'node:assert/strict';
import {requestLlmJson, requestLlmText} from '../../src/core/llm/client.ts';
import type {Env} from '../../src/types/env.ts';

interface Seen {
    url: string;
    auth: string | null;
    body: {model: string; stream: boolean; messages: Array<{role: string; content: string}>};
}

function envWith(reply: () => Response, seen: Seen[]): Env {
    return {
        GATEWAY_API_KEY: 'k',
        LLM_GATEWAY_MODEL: 'cnb/test-model',
        CF_WORKER: {
            async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
                seen.push({
                    url: String(input),
                    auth: new Headers(init?.headers).get('authorization'),
                    body: JSON.parse(String(init?.body)),
                });
                return reply();
            },
        },
    } as unknown as Env;
}

function chat(content: string, reasoning?: string): Response {
    return new Response(JSON.stringify({choices: [{message: {content, reasoning_content: reasoning}}]}), {
        headers: {'content-type': 'application/json'},
    });
}

async function main(): Promise<void> {
    {
        const seen: Seen[] = [];
        const env = envWith(() => chat('  你好  '), seen);
        assert.equal(await requestLlmText(env, {system: '规则', user: '问题'}), '你好');
        assert.equal(seen.length, 1);
        assert.equal(seen[0].url, 'https://cf-worker/v1/chat/completions');
        assert.equal(seen[0].auth, 'Bearer k');
        assert.equal(seen[0].body.model, 'cnb/test-model');
        assert.equal(seen[0].body.stream, false);
        assert.deepEqual(seen[0].body.messages, [
            {role: 'system', content: '规则'},
            {role: 'user', content: '问题'},
        ]);
    }

    {
        const env = envWith(() => chat('```json\n{"tag":"搞笑"}\n```'), []);
        assert.deepEqual(await requestLlmJson(env, {user: 'x'}), {tag: '搞笑'});
    }

    {
        // 推理模型把 JSON 留在思考里时也能取到。
        const env = envWith(() => chat('', '想了想 {"tag":"开心"}'), []);
        assert.deepEqual(await requestLlmJson(env, {user: 'x'}), {tag: '开心'});
    }

    {
        // 没钥匙就不走网关：这里没有 D1，走到本地配置会抛错，说明确实没打网关。
        const seen: Seen[] = [];
        const env = {...envWith(() => chat('不该到这里'), seen), GATEWAY_API_KEY: ''} as Env;
        await assert.rejects(() => requestLlmText(env, {user: '问题'}));
        assert.equal(seen.length, 0);
    }

    {
        // 要看图、点名模型的请求，都不走网关。
        const seen: Seen[] = [];
        const env = envWith(() => chat('不该到这里'), seen);
        await assert.rejects(() => requestLlmText(env, {user: '问题', imageUrl: 'https://a/b.jpg'}));
        await assert.rejects(() => requestLlmText(env, {user: '问题', model: 'x'}));
        await assert.rejects(() => requestLlmText(env, {user: '问题', name: 'spark'}));
        assert.equal(seen.length, 0);
    }

    {
        // 网关出错会往下走本地配置；这里没有 D1，所以最终抛错，但网关确实被问过一次。
        const seen: Seen[] = [];
        const env = envWith(() => new Response('boom', {status: 502}), seen);
        await assert.rejects(() => requestLlmText(env, {user: '问题'}));
        assert.equal(seen.length, 1);
    }
    console.log('llm-gateway-check ok');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
