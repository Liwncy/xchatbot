import type {IncomingMessage} from '../types/message.js';
import {PluginManager} from './manager.js';
import type {MessageEvent} from './types.js';

/**
 * 插件运行时的推荐入口。
 *
 * - 对外提供注册、注销、枚举与查询等语义化 API
 * - 屏蔽底层 `PluginManager` 单例的直接使用细节
 */
const pluginRegistry = new PluginManager();

/** 兼容导出：保留全局插件注册表单例。新代码优先使用下方门面函数。 */
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

/** 底层容器实现类型导出；常规运行时访问仍推荐使用本文件门面函数。 */
export {PluginManager};

