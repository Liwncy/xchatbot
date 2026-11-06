import assert from 'node:assert/strict';
import {formatCurrentInbound} from '../../src/core/inbound.ts';
import {matchCommandId, tryHandlePersona, wrapUserContent} from '../../src/core/persona/index.ts';
import type {IncomingMessage} from '../../src/core/message.ts';
import type {Env} from '../../src/types/env.ts';

type CatalogRow = {
    id: number;
    role_key: string;
    category: string;
    name: string;
    triggers: string;
    instruction: string;
    ack: string;
    status: string;
    sort_no: number;
};

const kv = new Map<string, string>();
const rows: CatalogRow[] = [];
const tables = new Set<string>(['roleplay_character']);

function mockD1() {
    const exec = (sql: string, args: unknown[] = []) => ({
        async run() {
            if (/ALTER TABLE roleplay_character RENAME TO persona/iu.test(sql)) {
                tables.delete('roleplay_character');
                tables.add('persona');
            }
            if (/CREATE TABLE IF NOT EXISTS persona/iu.test(sql)) tables.add('persona');
            if (/DROP TABLE roleplay_character/iu.test(sql)) tables.delete('roleplay_character');
            if (/INSERT INTO persona/iu.test(sql)) {
                // 模拟 createPersona 的取号：整张表最大 id + 1
                const next = (rows.length > 0 ? Math.max(...rows.map((row) => row.id)) : 0) + 1;
                rows.push({
                    id: next,
                    role_key: String(args[0]),
                    category: '自定义',
                    name: String(args[1]),
                    triggers: '',
                    instruction: String(args[2]),
                    ack: String(args[3]),
                    status: 'active',
                    sort_no: 200,
                });
                return {success: true, meta: {changes: 1}};
            }
            return {success: true, meta: {changes: 0}};
        },
        async all() {
            if (/sqlite_master/iu.test(sql)) {
                return {results: [...tables].map((name) => ({name}))};
            }
            if (/PRAGMA table_info\(persona\)/iu.test(sql)) {
                return {results: [{name: 'id'}, {name: 'category'}]};
            }
            let list = rows.slice();
            if (/status = 'active'/iu.test(sql)) {
                list = list.filter((row) => row.status === 'active');
            }
            if (/ORDER BY sort_no ASC, id ASC, role_key ASC/iu.test(sql)) {
                list.sort((a, b) => a.sort_no - b.sort_no || a.id - b.id || a.role_key.localeCompare(b.role_key));
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
        chatId: '123@chatroom',
        senderId: 'wxid_owner',
        senderName: '李芈仙',
        to: '123@chatroom',
        timestamp: 1,
        messageId: 'm1',
        content: '你好',
        raw: {},
        ...partial,
    };
}

async function main() {
    assert.equal(await tryHandlePersona(env, msg({senderId: 'wxid_other'}), '加人格 猫娘 你是猫娘'), '这个我加不了');
    assert.equal(await tryHandlePersona(env, msg(), '加人格'), '名字和怎么说写一起，换行也行');
    assert.equal(await tryHandlePersona(env, msg(), '加人格 猫娘 你是猫娘，短句。'), '好，记下了。说 #人格 猫娘 就行');
    assert.equal(tables.has('persona') && !tables.has('roleplay_character'), true);
    assert.equal(await tryHandlePersona(env, msg(), '加人格 猫娘 再写一遍'), '已经有这个了');

    // 自定义人格的 id 接在整张表最大 id 后面
    assert.equal(rows.find((row) => row.role_key === '猫娘')?.id, 1);
    assert.equal(await tryHandlePersona(env, msg(), '加人格 狗娘 你是狗娘'), '好，记下了。说 #人格 狗娘 就行');
    assert.equal(rows.find((row) => row.role_key === '狗娘')?.id, 2);
    rows.push({
        id: 100,
        role_key: 'lvcha',
        category: '性格',
        name: '绿茶',
        triggers: '',
        instruction: '演绿茶',
        ack: '好，绿茶。',
        status: 'active',
        sort_no: 10,
    });
    // 列表：按目录顺序分组，性格（sort 10）在前，自定义（sort 200）在后
    const expectedList = '性格：绿茶\n自定义：猫娘、狗娘\n说 #人格 名字 就换，#人格正常 切回来';
    assert.equal(await tryHandlePersona(env, msg(), '人格列表'), expectedList);
    assert.equal(await tryHandlePersona(env, msg(), '人格'), expectedList);
    assert.equal(await tryHandlePersona(env, msg({senderId: 'wxid_other'}), '人格列表'), expectedList);
    assert.equal(await matchCommandId(env, '人格猫娘'), '猫娘');
    assert.equal(await matchCommandId(env, '扮演猫娘'), null);
    assert.equal(await matchCommandId(env, '当猫娘'), null);
    assert.equal(await matchCommandId(env, '换成猫娘'), null);
    assert.equal(await matchCommandId(env, '今天天气'), null);
    assert.equal(await tryHandlePersona(env, msg(), '今天天气'), null);
    assert.equal(await tryHandlePersona(env, msg(), '扮演猫娘'), null);
    assert.equal(await tryHandlePersona(env, msg(), '加角色 猫娘 你是猫娘'), null);
    assert.equal(await tryHandlePersona(env, msg(), '人格猫娘'), '好，猫娘。');
    assert.equal(await tryHandlePersona(env, msg(), '当前人格'), '现在是猫娘');
    assert.equal(await tryHandlePersona(env, msg(), '现在演谁'), null);
    assert.equal(await tryHandlePersona(env, msg(), '当前角色'), null);

    {
        const inbound = await formatCurrentInbound(msg({content: '在吗'}), env);
        assert.match(inbound, /persona=猫娘/);
        assert.doesNotMatch(inbound, /role=/u);
        assert.match(inbound, /scope=group:123@chatroom/);
        const persona = {roleKey: '猫娘', category: '自定义', name: '猫娘', triggers: [], instruction: '你是猫娘，短句。', ack: '好，猫娘。'};
        const turn = `## 本条\n\n> ${inbound}`;
        const wrapped = wrapUserContent(turn, persona);
        assert.match(wrapped, /^## 本条\n\n> /u);
        assert.match(wrapped, /\n\n## 人格\n\n你是猫娘，短句。$/u);
        assert.ok(wrapped.includes(inbound));
        assert.doesNotMatch(wrapped, /正事只调 peer_search/u);
        const withContext = `## 上下文\n\n近30分钟，不是这次要回的。\n\n- 张三: 刚才\n\n## 本条\n\n> ${inbound}`;
        const wrappedContext = wrapUserContent(withContext, persona);
        assert.match(wrappedContext, /## 本条\n\n> [\s\S]*\n\n## 人格\n\n你是猫娘，短句。$/u);
        assert.ok(wrappedContext.includes(inbound));
    }

    const bindKey = 'persona:bind:golem:123@chatroom';
    const legacyKey = 'roleplay:bind:golem:123@chatroom';
    kv.delete(bindKey);
    kv.set(legacyKey, '猫娘');
    assert.equal(await tryHandlePersona(env, msg(), '当前人格'), '现在是猫娘');
    assert.equal(kv.get(bindKey), '猫娘');
    assert.equal(kv.has(legacyKey), false);

    assert.equal(await tryHandlePersona(env, msg(), '不当了'), null);
    assert.equal(await tryHandlePersona(env, msg(), '别演了'), null);
    assert.equal(await tryHandlePersona(env, msg(), '人格正常'), '好，正常了。');
    assert.equal(await tryHandlePersona(env, msg(), '当前人格'), '现在没换');
    assert.equal(await tryHandlePersona(env, msg(), '人格猫娘'), '好，猫娘。');
    assert.equal(await tryHandlePersona(env, msg(), '人格恢复'), '好，正常了。');
    assert.equal(await tryHandlePersona(env, msg(), '当前人格'), '现在没换');

    assert.equal(await matchCommandId(env, '人格绿茶'), 'lvcha');
    assert.equal(await matchCommandId(env, '扮演绿茶'), null);
    assert.equal(await tryHandlePersona(env, msg(), '人格绿茶'), '好，绿茶。');
    assert.equal(await tryHandlePersona(env, msg(), '当前人格'), '现在是绿茶');

    console.log('✓ persona');
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
