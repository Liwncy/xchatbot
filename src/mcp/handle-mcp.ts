import {createMcpHandler} from '@modelcontextprotocol/server';
import {authorizeOpenClawRequest} from '../plugins/agent/openclaw/auth.js';
import type {Env} from '../types/env.js';
import {createChannelMcpServer} from './server.js';

export function handleChannelMcp(request: Request, env: Env): Promise<Response> {
    if (!authorizeOpenClawRequest(request, env)) {
        return Promise.resolve(new Response('unauthorized', {status: 401}));
    }
    const handler = createMcpHandler(() => createChannelMcpServer(env));
    return handler.fetch(request);
}
