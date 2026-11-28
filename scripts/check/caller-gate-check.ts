import assert from 'node:assert/strict';
import {z} from 'zod';
import {installCallerGate, judgeCaller} from '../../src/mcp/caller-gate.ts';
import type {Env} from '../../src/types/env.ts';

const env = {BOT_OWNER_WECHAT_ID: 'wxid_owner'} as Env;

assert.equal((judgeCaller(env, {platform: 'golem', userId: 'wxid_owner'}) as {isOwner: boolean}).isOwner, true);
assert.match((judgeCaller(env, {platform: 'golem', userId: 'wxid_ow'}) as {text?: string}).text ?? '', /不完整/);

const registered: {schema: z.ZodType; handler: (args: Record<string, unknown>) => Promise<{isError?: boolean; content?: {text: string}[]}>}[] = [];
const server = {
    registerTool(
        name: string,
        config: {inputSchema?: z.ZodType},
        handler: (args: Record<string, unknown>) => Promise<{isError?: boolean; content?: {text: string}[]}>,
    ) {
        if (name === 'agbot_app_log') registered.push({schema: config.inputSchema as z.ZodType, handler});
    },
};
installCallerGate(server as never, env);
server.registerTool('agbot_app_log', {
    inputSchema: z.object({platform: z.string().optional(), limit: z.number().optional()}),
}, async () => ({content: [{text: 'logs'}]}));

const gate = registered[0];
assert.ok(gate);
assert.equal(gate.schema.safeParse({limit: 5}).success, false);
assert.equal(gate.schema.safeParse({platform: 'golem', userId: 'wxid_owner', limit: 5}).success, true);
async function main(): Promise<void> {
    const denied = await gate.handler({platform: 'golem', userId: 'wxid_other'});
    assert.equal(denied.isError, true);
    const allowed = await gate.handler({platform: 'golem', userId: 'wxid_owner'});
    assert.equal(allowed.content?.[0]?.text, 'logs');
    console.log('✓ caller-gate');
}

void main();
