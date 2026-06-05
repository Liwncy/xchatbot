import type {ExecutionContext, ScheduledController} from '@cloudflare/workers-types';
import {handleScheduledDispatch} from '../scheduler';
import type {Env} from '../types/env.js';

export async function handleScheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
): Promise<void> {
    await handleScheduledDispatch(controller, env, ctx);
}

