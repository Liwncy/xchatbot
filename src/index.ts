import {handleFetch} from './app.js';
import {consolidateDueSessions} from './core/memory/consolidate.js';
import type {Env} from './types/env.js';

export {AgentMailbox} from './core/agent-mailbox.js';

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return handleFetch(request, env, ctx);
    },
    scheduled(_event, env, ctx): void {
        // 只做一件事：整理有新消息的聊天的记忆卡。没新消息不调模型，失败不影响别的
        ctx.waitUntil(consolidateDueSessions(env, {limit: 2}).then(() => undefined, () => undefined));
    },
} satisfies ExportedHandler<Env>;
