import type {Env} from '../types/env.js';
import type {IncomingMessage} from './message.js';

export interface PluginContext {
    env: Env;
    requestId: string;
    waitUntil: (promise: Promise<unknown>) => void;
}

export function resolveChatId(message: IncomingMessage): string {
    if (message.source === 'group' && message.room?.id) {
        return message.room.id;
    }
    return message.from;
}
