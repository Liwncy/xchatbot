import type { MessagePlugin } from './types.js';
import type { IncomingMessage } from '../types/message.js';

/**
 * Central registry for message plugins.
 *
 * Plugins are matched in the order they were registered.
 * Use the exported singleton {@link pluginManager} for normal operation.
 */
export class PluginManager {
  private plugins: MessagePlugin[] = [];

  /** Register a plugin. If a plugin with the same name exists it will be replaced. */
  register(plugin: MessagePlugin): void {
    const idx = this.plugins.findIndex((p) => p.name === plugin.name);
    if (idx >= 0) {
      this.plugins[idx] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  /** Remove a plugin by name. */
  unregister(name: string): void {
    this.plugins = this.plugins.filter((p) => p.name !== name);
  }

  /**
   * Find the first plugin whose {@link MessagePlugin.match} returns `true`
   * for the given content and message.
   */
  findPlugin(content: string, message: IncomingMessage): MessagePlugin | undefined {
    return this.plugins.find((p) => p.match(content, message));
  }

  /** Return a snapshot of all registered plugins. */
  getPlugins(): ReadonlyArray<MessagePlugin> {
    return [...this.plugins];
  }
}

/** Global singleton shared across the application. */
export const pluginManager = new PluginManager();
