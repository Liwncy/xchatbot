import type {Env} from '../types/message.js';
import {handleAdminDebug} from './debug.js';
import {handleAdminPlugins} from './plugins.js';
import {handleAdminScheduler} from './scheduler.js';

export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/admin/debug' || pathname.startsWith('/admin/debug/')) {
        return handleAdminDebug(request, env);
    }

    if (pathname === '/admin/plugins' || pathname.startsWith('/admin/plugins/')) {
        return handleAdminPlugins(request, env);
    }

    if (pathname === '/admin/scheduler' || pathname.startsWith('/admin/scheduler/')) {
        return handleAdminScheduler(request, env);
    }

    return new Response('Not Found', {status: 404});
}

