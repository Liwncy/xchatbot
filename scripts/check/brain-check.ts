import assert from 'node:assert/strict';
import {tryHandleBrain} from '../../src/core/brain-command.ts';
import {loadBrainConnection, resolveAgentBrain} from '../../src/core/brain-store.ts';
import type {IncomingMessage} from '../../src/core/message.ts';
import type {Env} from '../../src/types/env.ts';

type BrainRow = {
    brain_key: string;
    agent_kind: string;
    display_name: string;
    base_url: string;
    token: string;
    timeout_ms: number;
    enabled: number;
    is_default: number;
    app_id: string;
    auto_forward: number;
    updated_at: number;
};

const kv = new Map<string, string>();
const rows = new Map<string, BrainRow>();

function mockD1() {
    const exec = (sql: string, args: unknown[] = []) => ({
        async run() {
            if (/INSERT OR IGNORE INTO agent_brain/iu.test(sql)) {
                const key = String(args[0]);
                if (!rows.has(key)) {
                    rows.set(key, {
                        brain_key: key,
                        agent_kind: String(args[8] ?? key),
                        display_name: String(args[1]),
                        base_url: String(args[2]),
                        token: String(args[3]),
                        timeout_ms: Number(args[4]),
                        enabled: 1,
                        is_default: Number(args[5]),
                        app_id: String(args[6]),
                        auto_forward: Number(args[7]),
                        updated_at: Number(args[9]),
                    });
                }
            }
            if (/SET agent_kind = brain_key/iu.test(sql)) {
                for (const row of rows.values()) {
                    if (!row.agent_kind && ['openclaw', 'hermes', 'qwenpaw', 'snailai'].includes(row.brain_key)) {
                        row.agent_kind = row.brain_key;
                    }
                }
            }
            if (/SET token = \?/iu.test(sql)) {
                const row = rows.get(String(args[2]));
                if (row && row.token === '') {
                    row.token = String(args[0]);
                    row.updated_at = Number(args[1]);
                }
            }
            if (/UPDATE agent_brain/iu.test(sql) && /is_default/iu.test(sql)) {
                const key = String(args[0]);
                const now = Number(args[1]);
                for (const row of rows.values()) {
                    row.is_default = row.brain_key === key ? 1 : 0;
                    row.updated_at = now;
                }
            }
            return {success: true};
        },
        async all() {
            if (/table_info\(agent_brain\)/iu.test(sql)) {
                return {results: [{name: 'agent_kind'}]};
            }
            throw new Error(`unexpected sql: ${sql}`);
        },
        async first() {
            if (/lower\(brain_key\) = lower\(\?\)/iu.test(sql)) {
                const name = String(args[0]).toLowerCase();
                return [...rows.values()].find((row) => row.brain_key.toLowerCase() === name) ?? null;
            }
            if (/lower\(display_name\) = lower\(\?\)/iu.test(sql)) {
                const name = String(args[0]).toLowerCase();
                return [...rows.values()].find((row) => row.display_name.toLowerCase() === name) ?? null;
            }
            if (/brain_key = \?/iu.test(sql)) {
                return rows.get(String(args[0])) ?? null;
            }
            if (/is_default = 1/iu.test(sql)) {
                return [...rows.values()].find((row) => row.is_default === 1) ?? null;
            }
            throw new Error(`unexpected sql: ${sql}`);
        },
    });
    return {
        prepare(sql: string) {
            return {
                bind(...args: unknown[]) {
                    return exec(sql, args);
                },
                ...exec(sql),
            };
        },
    };
}

const env = {
    BOT_OWNER_ID: 'wxid_owner',
    BOT_OWNER_WECHAT_ID: 'wxid_owner',
    HERMES_BASE_URL: 'https://hermes.example',
    AGENT_BRIDGE_TOKEN: 'bridge-token',
    XBOT_CHANNEL_AUTO_FORWARD: 'false',
    XBOT_KV: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => {
            kv.set(key, value);
        },
        delete: async (key: string) => {
            kv.delete(key);
        },
        list: async ({prefix = ''}: {prefix?: string; cursor?: string} = {}) => ({
            keys: [...kv.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({name})),
            list_complete: true,
        }),
    },
    XBOT_DB: mockD1(),
} as unknown as Env;

function msg(partial: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        platform: 'golem',
        type: 'text',
        source: 'group',
        chatId: '123@chatroom',
        senderId: 'wxid_owner',
        to: '123@chatroom',
        timestamp: 1,
        messageId: 'm1',
        raw: {},
        ...partial,
    };
}

async function main() {
    const room = msg();
    const other = msg({chatId: '456@chatroom', messageId: 'm2'});
    const web = msg({platform: 'web', chatId: 'room-web', messageId: 'm3'});

    assert.equal(await tryHandleBrain(env, msg({senderId: 'wxid_other'}), '脑子'), '这事只有主人能定');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '默认是 OpenClaw');
    assert.equal(rows.get('openclaw')?.token, 'bridge-token');
    assert.equal(rows.get('hermes')?.token, 'bridge-token');
    assert.equal(rows.get('qwenpaw')?.token, 'bridge-token');
    assert.equal(rows.get('snailai')?.token, '');
    assert.equal(await resolveAgentBrain(env, room), 'openclaw');

    const hermes = await loadBrainConnection(env, 'hermes');
    assert.equal(hermes.baseUrl, 'https://hermes.example');
    assert.equal(hermes.token, 'bridge-token');
    const openclaw = await loadBrainConnection(env, 'openclaw');
    assert.equal(openclaw.autoForward, false);

    assert.equal(await tryHandleBrain(env, room, '脑子 openclaw'), '好，这个会话换成 OpenClaw');
    assert.equal(kv.get('agent:brain:session:golem:123@chatroom'), 'openclaw');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个会话是 OpenClaw');
    assert.equal(await tryHandleBrain(env, other, '脑子'), '默认是 OpenClaw');

    assert.equal(await tryHandleBrain(env, room, '脑子 平台 qwenpaw'), '好，这个平台换成 QwenPaw');
    assert.equal(kv.get('agent:brain:platform:golem'), 'qwenpaw');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个会话是 OpenClaw');
    assert.equal(await tryHandleBrain(env, other, '脑子'), '这个平台是 QwenPaw');

    assert.equal(await tryHandleBrain(env, room, '脑子 全部 snailai'), '好，默认换成 SnailAI');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个会话是 OpenClaw');
    assert.equal(await tryHandleBrain(env, web, '脑子'), '默认是 SnailAI');
    assert.equal([...rows.values()].filter((row) => row.is_default === 1).map((row) => row.brain_key).join(','), 'snailai');

    assert.equal(await tryHandleBrain(env, room, '脑子 取消'), '好，这个会话不单独定了');
    assert.equal(kv.has('agent:brain:session:golem:123@chatroom'), false);
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个平台是 QwenPaw');
    assert.equal(await tryHandleBrain(env, room, '脑子 平台 取消'), '好，这个平台不单独定了');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '默认是 SnailAI');

    // 平台强制：只清本平台的会话级设置，别的平台不动
    assert.equal(await tryHandleBrain(env, room, '脑子 hermes'), '好，这个会话换成 Hermes');
    assert.equal(await tryHandleBrain(env, other, '脑子 qwenpaw'), '好，这个会话换成 QwenPaw');
    assert.equal(await tryHandleBrain(env, web, '脑子 hermes'), '好，这个会话换成 Hermes');
    assert.equal(await tryHandleBrain(env, room, '脑子 平台 snailai'), '好，这个平台换成 SnailAI');
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个会话是 Hermes');
    assert.equal(
        await tryHandleBrain(env, room, '脑子 平台 snailai 强制'),
        '好，这个平台换成 SnailAI，2 个单独定过的会话也跟上了',
    );
    assert.equal(await tryHandleBrain(env, room, '脑子'), '这个平台是 SnailAI');
    assert.equal(await tryHandleBrain(env, other, '脑子'), '这个平台是 SnailAI');
    assert.equal(await tryHandleBrain(env, web, '脑子'), '这个会话是 Hermes');
    assert.equal(
        await tryHandleBrain(env, room, '脑子 平台 snailai 强制'),
        '好，这个平台换成 SnailAI',
    );
    await tryHandleBrain(env, web, '脑子 取消');
    await tryHandleBrain(env, room, '脑子 平台 取消');

    assert.equal(await tryHandleBrain(env, room, '脑子 没有'), '没这颗');
    assert.equal(await tryHandleBrain(env, room, '脑子 平台'), '说一颗，比如 Hermes');
    assert.equal(await tryHandleBrain(env, room, '脑子 全部 取消'), '默认得换成另一颗');

    const openclawRow = rows.get('openclaw');
    assert.ok(openclawRow);
    openclawRow.enabled = 0;
    assert.equal(await tryHandleBrain(env, room, '脑子 openclaw'), '这颗先不用');

    rows.set('home', {
        brain_key: 'home',
        agent_kind: 'openclaw',
        display_name: '家里',
        base_url: 'https://home.example',
        token: 'home-token',
        timeout_ms: 120_000,
        enabled: 1,
        is_default: 0,
        app_id: '',
        auto_forward: 1,
        updated_at: 1,
    });
    assert.equal(await tryHandleBrain(env, room, '脑子 家里'), '好，这个会话换成 家里');
    assert.equal(kv.get('agent:brain:session:golem:123@chatroom'), 'home');
    assert.equal(await resolveAgentBrain(env, room), 'openclaw');
    const home = await loadBrainConnection(env, 'home');
    assert.equal(home.kind, 'openclaw');
    assert.equal(home.baseUrl, 'https://home.example');
    assert.equal(await tryHandleBrain(env, room, '脑子 取消'), '好，这个会话不单独定了');

    rows.set('blank', {
        brain_key: 'blank',
        agent_kind: '',
        display_name: '空白',
        base_url: '',
        token: '',
        timeout_ms: 120_000,
        enabled: 1,
        is_default: 0,
        app_id: '',
        auto_forward: 1,
        updated_at: 1,
    });
    assert.equal(await tryHandleBrain(env, room, '脑子 空白'), '这颗还没标类型');
    assert.equal(await tryHandleBrain(env, room, '脑子 snailai'), '好，这个会话换成 SnailAI');
    assert.equal(await tryHandleBrain(env, room, '脑子 SnailAI'), '好，这个会话换成 SnailAI');
    assert.equal(await tryHandleBrain(env, room, '脑子 snail'), '没这颗');

    assert.equal(await tryHandleBrain(env, room, '人格'), null);
    console.log('✓ brain');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
