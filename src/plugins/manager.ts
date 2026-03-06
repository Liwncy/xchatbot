import type { MessageEvent } from './types.js';
import type { IncomingMessage } from '../types/message.js';

/**
 * Central registry for message event handlers.
 *
 * Handlers are matched in the order they were registered.
 * Use the exported singleton {@link pluginManager} for normal operation.
 */
export class PluginManager {
  private plugins: MessageEvent[] = [];

  /** Register a handler. If a handler with the same name exists it will be replaced. */
  register(plugin: MessageEvent): void {
    const idx = this.plugins.findIndex((p) => p.name === plugin.name);
    if (idx >= 0) {
      this.plugins[idx] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  /** Remove a handler by name. */
  unregister(name: string): void {
    this.plugins = this.plugins.filter((p) => p.name !== name);
  }

  /**
   * Find the first handler whose {@link MessageEvent | match} returns `true`
   * for the given message.
   */
  findPlugin(message: IncomingMessage): MessageEvent | undefined {
    return this.plugins.find((p) => {
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

  /** Return a snapshot of all registered handlers. */
  getPlugins(): ReadonlyArray<MessageEvent> {
    return [...this.plugins];
  }
}

/** Global singleton shared across the application. */
export const pluginManager = new PluginManager();
