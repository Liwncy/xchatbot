import type {IncomingMessage} from '../types/message.js';
import {pluginManager} from './registry';

export function findMatchingPlugins(message: IncomingMessage) {
    return pluginManager.findPlugins(message);
}

export function findFirstMatchingPlugin(message: IncomingMessage) {
    return pluginManager.findPlugin(message);
}


