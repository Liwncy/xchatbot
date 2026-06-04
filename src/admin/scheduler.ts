import type {Env} from '../types/env.js';
import {authorizeAdmin} from '../middleware/auth.js';
import {handleSchedulerAdmin} from '../scheduler/admin.js';

export async function handleAdminScheduler(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    return handleSchedulerAdmin(request, env);
}

