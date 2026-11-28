import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {Env} from '../types/env.js';

/**
 * 模型调本通道 MCP 时，主人身份只在这一处判断。
 * 判断规则与 cf-mcp-tools 的 caller-gate 相同：认 userId，platform 必须带上。
 * 空的、截断的、把「id/昵称」整段抄来的，直接拒。
 */

const OWNER_TOOLS = new Set([
    'agbot_app_log',
]);

const CALLER_HINT =
    ' platform 和 userId 从本条前缀原样抄：platform= 后面那段，斜杠前的完整 id。不要截断，不要用昵称。对不上主人的会被拒绝。';

type OwnerEnv = {
    BOT_OWNER_ID?: string;
    BOT_OWNER_WECHAT_ID?: string;
};

export type CallerVerdict =
    | {ok: true; isOwner: boolean; platform: string; userId: string}
    | {ok: false; text: string};

export function configuredOwnerIds(env: OwnerEnv): string[] {
    const ids = [env.BOT_OWNER_ID, env.BOT_OWNER_WECHAT_ID]
        .map((item) => item?.trim() ?? '')
        .filter(Boolean);
    return [...new Set(ids)];
}

export function judgeCaller(env: OwnerEnv, args: unknown): CallerVerdict {
    const record = args && typeof args === 'object' ? args as Record<string, unknown> : {};
    const platform = typeof record.platform === 'string' ? record.platform.trim() : '';
    const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
    if (!platform || !userId) return {ok: false, text: '缺少 platform 或 userId'};
    if (userId.includes('/') || /\s/u.test(userId)) {
        return {ok: false, text: 'userId 只要斜杠前的完整 id'};
    }
    const owners = configuredOwnerIds(env);
    if (owners.some((owner) => owner.startsWith(userId) && userId.length < owner.length)) {
        return {ok: false, text: 'userId 不完整，从本条前缀斜杠前原样抄'};
    }
    return {ok: true, isOwner: owners.includes(userId), platform, userId};
}

type ZodLike = {
    shape?: Record<string, unknown>;
    extend?: (shape: Record<string, z.ZodType>) => ZodLike;
};

type ToolConfig = {
    description?: string;
    inputSchema?: unknown;
};

type ToolHandler = (args: Record<string, unknown>, extra?: unknown) => unknown;

type LooseServer = {
    registerTool: (name: string, config: ToolConfig, handler: ToolHandler) => unknown;
};

function deny(text: string) {
    return {content: [{type: 'text' as const, text}], isError: true as const};
}

function withOwnerSchema(schema: unknown): unknown {
    const zodSchema = schema as ZodLike | undefined;
    if (!zodSchema?.extend) return schema;
    return zodSchema.extend({
        platform: z.string().min(1).describe('本条前缀里 platform= 后面那段，原样抄'),
        userId: z.string().min(1).describe('本条前缀斜杠前的完整 id，原样抄，不要截断'),
    });
}

export function installCallerGate(server: McpServer, env: Env): void {
    const loose = server as unknown as LooseServer;
    const raw = loose.registerTool.bind(server);
    loose.registerTool = (name, config, handler) => {
        if (!OWNER_TOOLS.has(name)) return raw(name, config, handler);
        return raw(
            name,
            {
                ...config,
                description: `${config.description ?? ''}${CALLER_HINT}`.trim(),
                inputSchema: withOwnerSchema(config.inputSchema),
            },
            async (args, extra) => {
                const verdict = judgeCaller(env, args);
                if (!verdict.ok) return deny(verdict.text);
                if (!verdict.isOwner) return deny('这事只有主人能定');
                return handler(args, extra);
            },
        );
    };
}
