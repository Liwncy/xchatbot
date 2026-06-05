import type {IncomingMessage} from '../types/message.js';
import {findFirstRegisteredPlugin, findRegisteredPlugins} from './registry';

/**
 * 插件消息分发查询入口。
 *
 * 仅负责把消息匹配请求转交给注册表门面，
 * 不直接依赖底层 `PluginManager` 实现。
 */
export function findMatchingPlugins(message: IncomingMessage) {
    return findRegisteredPlugins(message);
}

export function findFirstMatchingPlugin(message: IncomingMessage) {
    return findFirstRegisteredPlugin(message);
}


