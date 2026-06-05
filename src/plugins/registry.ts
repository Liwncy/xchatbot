import type {IncomingMessage} from '../types/message.js';
import {PluginManager} from './manager.js';
import type {MessageEvent} from './types.js';

const pluginRegistry = new PluginManager();

/** 兼容导出：保留全局插件注册表单例。 */
export const pluginManager = pluginRegistry;

/** 注册一个插件到全局注册表。 */
export function registerPlugin(plugin: MessageEvent): void {
	pluginRegistry.register(plugin);
}

/** 从全局注册表按名称移除插件。 */
export function unregisterPlugin(name: string): void {
	pluginRegistry.unregister(name);
}

/** 获取当前全局注册表中的插件快照。 */
export function listRegisteredPlugins(): ReadonlyArray<MessageEvent> {
	return pluginRegistry.getPlugins();
}

/** 查找所有匹配给定消息的已注册插件。 */
export function findRegisteredPlugins(message: IncomingMessage): MessageEvent[] {
	return pluginRegistry.findPlugins(message);
}

/** 查找首个匹配给定消息的已注册插件。 */
export function findFirstRegisteredPlugin(message: IncomingMessage): MessageEvent | undefined {
	return pluginRegistry.findPlugin(message);
}

export {PluginManager};

