import {AsyncLocalStorage} from 'node:async_hooks';
import type {Env} from '../../types/env.js';

export type AppLogContext = {
    env: Env;
    waitUntil?: (promise: Promise<unknown>) => void;
};

const storage = new AsyncLocalStorage<AppLogContext>();

export function runWithLogContext<T>(ctx: AppLogContext, fn: () => T): T {
    return storage.run(ctx, fn);
}

export function getLogContext(): AppLogContext | undefined {
    return storage.getStore();
}
