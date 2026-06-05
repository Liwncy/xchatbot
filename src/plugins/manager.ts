import type {MessageEvent} from './types.js';
import type {IncomingMessage} from '../types/message.js';

/**
 * 消息事件处理器注册表的底层容器实现。
 *
 * - 负责保存插件顺序与基础匹配逻辑
 * - 不直接作为推荐运行时入口对外暴露
 *
 * 常规注册/查询请优先通过 `registry.ts` 暴露的门面 API 访问。
 */
export class PluginManager {
    private plugins: MessageEvent[] = [];

    /** 注册一个处理器。如果已存在同名处理器则替换。 */
    register(plugin: MessageEvent): void {
        const idx = this.plugins.findIndex((p) => p.name === plugin.name);
        if (idx >= 0) {
            this.plugins[idx] = plugin;
        } else {
            this.plugins.push(plugin);
        }
    }

    /** 按名称移除一个处理器。 */
    unregister(name: string): void {
        this.plugins = this.plugins.filter((p) => p.name !== name);
    }

    /**
     * 按注册顺序返回所有匹配给定消息的处理器。
     */
    findPlugins(message: IncomingMessage): MessageEvent[] {
        return this.plugins.filter((p) => {
            if (p.type !== message.type) return false;
            if (p.type === 'text') {
                return p.match((message.content ?? '').trim(), message);
            }
            if (p.type === 'image') {
                return p.match(message);
            }
            return false;
        });
    }

    /**
     * 查找第一个对给定消息匹配（{@link MessageEvent | match} 返回 `true`）的处理器。
     */
    findPlugin(message: IncomingMessage): MessageEvent | undefined {
        return this.findPlugins(message)[0];
    }

    /** 返回所有已注册处理器的快照。 */
    getPlugins(): ReadonlyArray<MessageEvent> {
        return [...this.plugins];
    }
}

