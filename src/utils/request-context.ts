import {AsyncLocalStorage} from 'node:async_hooks';
import type {Env} from '../types/env.js';

export interface RequestContext {
    env: Env;
    waitUntil?: (promise: Promise<unknown>) => void;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
    context: RequestContext,
    fn: () => T,
): T {
    return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
    return storage.getStore();
}
