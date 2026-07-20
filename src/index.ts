import './scheduler/executors';
import './plugins/index.js';

import {handleFetch} from './handlers/fetch.js';
import {handleScheduled} from './handlers/scheduled.js';
import type {Env} from './types/env.js';
import {runWithRequestContext} from './utils/request-context.js';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const requestOrigin = new URL(request.url).origin;
        return runWithRequestContext(
            {env, waitUntil: (promise) => ctx.waitUntil(promise), requestOrigin},
            () => handleFetch(request, env, ctx),
        );
    },
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        await runWithRequestContext(
            {env, waitUntil: (promise) => ctx.waitUntil(promise)},
            () => handleScheduled(controller, env, ctx),
        );
    },
} satisfies ExportedHandler<Env>;
