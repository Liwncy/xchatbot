import './scheduler/executors';
import './plugins/index.js';

import {handleFetch} from './handlers/fetch.js';
import {handleScheduled} from './handlers/scheduled.js';
import type {Env} from './types/env.js';
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return handleFetch(request, env, ctx);
    },
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        await handleScheduled(controller, env, ctx);
    },
} satisfies ExportedHandler<Env>;
