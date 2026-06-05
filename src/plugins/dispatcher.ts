import type {IncomingMessage} from '../types/message.js';
import {findFirstRegisteredPlugin, findRegisteredPlugins} from './registry';

export function findMatchingPlugins(message: IncomingMessage) {
    return findRegisteredPlugins(message);
}

export function findFirstMatchingPlugin(message: IncomingMessage) {
    return findFirstRegisteredPlugin(message);
}


