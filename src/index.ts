import {handleFetch} from './app.js';
import type {Env} from './types/env.js';

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return handleFetch(request, env, ctx);
    },
    scheduled(): void {
        // 第一刀不跑定时任务
    },
} satisfies ExportedHandler<Env>;
