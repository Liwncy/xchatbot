import './scheduler/executors';

import {handleFetch} from './handlers/fetch.js';
import {handleScheduled} from './handlers/scheduled.js';
import type {Env} from './types/env.js';
export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        return handleFetch(request, env);
    },
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        await handleScheduled(controller, env, ctx);
    },
} satisfies ExportedHandler<Env>;
