import assert from 'node:assert/strict';
import {resolveAgentBrain} from '../src/core/brain.ts';
import {
    resetSnailaiConversation,
    snailaiExternalId,
    snailaiNickname,
    snailaiSessionKey,
} from '../src/core/snailai-session.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import type {Env} from '../src/types/env.ts';
import {readSnailAiConfig} from '../src/plugins/agent/snailai/client.ts';

assert.equal(resolveAgentBrain({} as Env), 'openclaw');
assert.equal(resolveAgentBrain({AGENT_BRAIN: 'OpenClaw'} as Env), 'openclaw');
assert.equal(resolveAgentBrain({AGENT_BRAIN: 'snailai'} as Env), 'snailai');
assert.equal(resolveAgentBrain({AGENT_BRAIN: 'snail-ai'} as Env), 'snailai');
assert.equal(resolveAgentBrain({AGENT_BRAIN: 'snail'} as Env), 'snailai');

assert.equal(readSnailAiConfig({} as Env), null);
assert.equal(readSnailAiConfig({
    SNAIL_AI_BASE_URL: 'https://host:8900',
    SNAIL_AI_APP_ID: '1',
} as Env), null);

const fromOrigin = readSnailAiConfig({
    SNAIL_AI_BASE_URL: 'https://host:8900/',
    SNAIL_AI_APP_ID: '1',
    SNAIL_AI_TOKEN: 'tok',
} as Env);
assert.equal(fromOrigin?.baseUrl, 'https://host:8900/snail-ai/openapi/v1');
assert.equal(fromOrigin?.agentId, 1);
assert.equal(fromOrigin?.timeoutMs, 180_000);

const fromFull = readSnailAiConfig({
    SNAIL_AI_BASE_URL: 'https://host:8900/snail-ai/openapi/v1',
    SNAIL_AI_APP_ID: '1',
    SNAIL_AI_TOKEN: 'tok',
    SNAIL_AI_PREFIX: 'ignored',
    SNAIL_AI_AGENT_ID: '3',
    SNAIL_AI_TIMEOUT_MS: '90000',
} as Env);
assert.equal(fromFull?.baseUrl, 'https://host:8900/snail-ai/openapi/v1');
assert.equal(fromFull?.agentId, 3);
assert.equal(fromFull?.timeoutMs, 90_000);

const privateMsg: IncomingMessage = {
    platform: 'golem',
    type: 'text',
    source: 'private',
    from: 'wxid_a',
    senderName: '张三',
    to: 'wxid_bot',
    timestamp: 1,
    messageId: 'm1',
    content: '你好',
    raw: {},
};

const groupMsg: IncomingMessage = {
    ...privateMsg,
    source: 'group',
    to: '123@chatroom',
    room: {id: '123@chatroom'},
};

assert.equal(snailaiSessionKey(privateMsg), 'golem:default:user:wxid_a');
assert.equal(snailaiExternalId(privateMsg), 'golem:default:wxid_a');
assert.equal(snailaiNickname(privateMsg), '张三');
assert.equal(snailaiSessionKey(groupMsg), 'golem:default:group:123@chatroom');
assert.equal(snailaiExternalId(groupMsg), 'golem:default:group:123@chatroom');

const kv = new Map<string, string>();
const env = {
    XBOT_KV: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => {
            kv.set(key, value);
        },
        delete: async (key: string) => {
            kv.delete(key);
        },
    },
} as unknown as Env;

async function main() {
    kv.set('snailai:conv:golem:default:user:wxid_a', 'old-conv');
    await resetSnailaiConversation(env, privateMsg);
    assert.equal(kv.has('snailai:conv:golem:default:user:wxid_a'), false);
    console.log('✓ snailai');
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
