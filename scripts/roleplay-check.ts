import assert from 'node:assert/strict';
import {formatCurrentInbound} from '../src/core/inbound.ts';
import {matchCommandId, tryHandleRoleplay, wrapUserContent} from '../src/core/roleplay/index.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import type {Env} from '../src/types/env.ts';

type CatalogRow = {
    role_key: string;
    name: string;
    triggers: string;
    instruction: string;
    ack: string;
    status: string;
    sort_no: number;
};

const kv = new Map<string, string>();
const rows: CatalogRow[] = [];

function mockD1() {
    const exec = (sql: string, args: unknown[] = []) => ({
        async run() {
            if (/CREATE TABLE/iu.test(sql) || /CREATE INDEX/iu.test(sql)) return {success: true};
            if (/INSERT INTO roleplay_character/iu.test(sql)) {
                rows.push({
                    role_key: String(args[0]),
                    name: String(args[1]),
                    triggers: String(args[2] ?? ''),
                    instruction: String(args[3]),
                    ack: String(args[4]),
                    status: String(args[5] ?? 'active'),
                    sort_no: Number(args[6] ?? 200),
                });
            }
            return {success: true};
        },
        async all() {
            let list = rows.slice();
            if (/status = 'active'/iu.test(sql)) {
                list = list.filter((row) => row.status === 'active');
            }
            if (/role_key = \?/iu.test(sql)) {
                list = list.filter((row) => row.role_key === args[0]);
            }
            return {results: list};
        },
        async first() {
            const {results} = await this.all();
            return results[0] ?? null;
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
    BOT_OWNER_WECHAT_ID: 'wxid_owner',
    XBOT_KV: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => {
            kv.set(key, value);
        },
        delete: async (key: string) => {
            kv.delete(key);
        },
    },
    XBOT_DB: mockD1(),
} as unknown as Env;

function msg(partial: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        platform: 'golem',
        type: 'text',
        source: 'group',
        from: 'wxid_owner',
        senderName: '李芈仙',
        to: '123@chatroom',
        timestamp: 1,
        messageId: 'm1',
        content: '你好',
        room: {id: '123@chatroom'},
        raw: {},
        ...partial,
    };
}

async function main() {
    assert.equal(await tryHandleRoleplay(env, msg({from: 'wxid_other'}), '加角色 猫娘 你是猫娘'), '这个我加不了');
    assert.equal(await tryHandleRoleplay(env, msg(), '加角色'), '名字和演法写一起，换行也行');
    assert.equal(await tryHandleRoleplay(env, msg(), '加角色 猫娘 你是猫娘，短句。'), '好，记下了。说扮演猫娘就行');
    assert.equal(await tryHandleRoleplay(env, msg(), '加角色 猫娘 再写一遍'), '已经有这个了');
    assert.equal(await matchCommandId(env, '扮演猫娘'), '猫娘');
    assert.equal(await matchCommandId(env, '今天天气'), null);
    assert.equal(await tryHandleRoleplay(env, msg(), '今天天气'), null);
    assert.equal(await tryHandleRoleplay(env, msg(), '扮演猫娘'), '好，猫娘。');
    assert.equal(await tryHandleRoleplay(env, msg(), '现在演谁'), '现在演猫娘');

    {
        const inbound = await formatCurrentInbound(msg({content: '在吗'}), env);
        assert.match(inbound, /role=猫娘/);
        assert.match(inbound, /scope=group:123@chatroom/);
        const wrapped = wrapUserContent(inbound, {id: '猫娘', name: '猫娘', triggers: [], instruction: '你是猫娘，短句。', ack: '好，猫娘。'});
        assert.equal(wrapped, `你是猫娘，短句。\n\n${inbound}`);
    }

    assert.equal(await tryHandleRoleplay(env, msg(), '不当了'), '好，不当了。');
    assert.equal(await tryHandleRoleplay(env, msg(), '当前角色'), '现在没演');

    rows.push({
        role_key: 'lvcha',
        name: '绿茶',
        triggers: '',
        instruction: '演绿茶',
        ack: '好，绿茶。',
        status: 'active',
        sort_no: 10,
    });
    assert.equal(await matchCommandId(env, '扮演绿茶'), 'lvcha');
    assert.equal(await tryHandleRoleplay(env, msg(), '扮演绿茶'), '好，绿茶。');
    assert.equal(await tryHandleRoleplay(env, msg(), '现在演谁'), '现在演绿茶');

    console.log('✓ roleplay');
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
