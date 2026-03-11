import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import type { MessageEvent, TextMessage } from '../../src/plugins/types.js';
import type { IncomingMessage, Env } from '../../src/types/message.js';

const env: Env = {};

function makeMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    platform: 'wechat',
    type: 'text',
    from: 'user_001',
    to: 'bot_001',
    timestamp: 1700000000,
    messageId: 'msg_001',
    raw: {},
    ...overrides,
  };
}

function createPlugin(overrides: Partial<TextMessage> = {}): TextMessage {
  return {
    type: 'text',
    name: 'test-plugin',
    description: 'A test plugin',
    match: (content) => content.includes('test'),
    handle: async () => ({ type: 'text', content: 'test reply' }),
    ...overrides,
  };
}

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('register', () => {
    it('registers a new plugin', () => {
      const plugin = createPlugin();
      manager.register(plugin);
      expect(manager.getPlugins()).toHaveLength(1);
      expect(manager.getPlugins()[0].name).toBe('test-plugin');
    });

    it('replaces existing plugin with the same name', () => {
      const plugin1 = createPlugin({ description: 'first' });
      const plugin2 = createPlugin({ description: 'second' });
      manager.register(plugin1);
      manager.register(plugin2);
      expect(manager.getPlugins()).toHaveLength(1);
      expect(manager.getPlugins()[0].description).toBe('second');
    });

    it('registers multiple plugins with different names', () => {
      manager.register(createPlugin({ name: 'plugin-a' }));
      manager.register(createPlugin({ name: 'plugin-b' }));
      expect(manager.getPlugins()).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('removes a registered plugin by name', () => {
      manager.register(createPlugin({ name: 'to-remove' }));
      expect(manager.getPlugins()).toHaveLength(1);
      manager.unregister('to-remove');
      expect(manager.getPlugins()).toHaveLength(0);
    });

    it('does nothing when unregistering a non-existent plugin', () => {
      manager.register(createPlugin({ name: 'keep' }));
      manager.unregister('non-existent');
      expect(manager.getPlugins()).toHaveLength(1);
    });
  });

  describe('findPlugin', () => {
    it('returns the first matching plugin', () => {
      manager.register(createPlugin({ name: 'alpha', match: (c) => c.includes('hello') }));
      manager.register(createPlugin({ name: 'beta', match: (c) => c.includes('hello') }));
      const found = manager.findPlugin(makeMessage({ content: 'hello' }));
      expect(found?.name).toBe('alpha');
    });

    it('returns undefined when no plugin matches', () => {
      manager.register(createPlugin({ match: (c) => c.includes('xyz') }));
      const found = manager.findPlugin(makeMessage({ content: 'no match here' }));
      expect(found).toBeUndefined();
    });

    it('skips non-matching plugins and finds a later one', () => {
      manager.register(createPlugin({ name: 'no-match', match: () => false }));
      manager.register(createPlugin({ name: 'yes-match', match: () => true }));
      const found = manager.findPlugin(makeMessage({ content: 'anything' }));
      expect(found?.name).toBe('yes-match');
    });

    it('skips plugins with non-matching message type', () => {
      manager.register(createPlugin({ name: 'text-only', match: () => true }));
      const found = manager.findPlugin(makeMessage({ type: 'image' }));
      expect(found).toBeUndefined();
    });
  });

  describe('findPlugins', () => {
    it('returns all matching plugins in registration order', () => {
      manager.register(createPlugin({ name: 'first', match: (c) => c.includes('go') }));
      manager.register(createPlugin({ name: 'second', match: (c) => c.includes('go') }));
      manager.register(createPlugin({ name: 'third', match: () => false }));

      const found = manager.findPlugins(makeMessage({ content: 'go now' }));
      expect(found.map((p) => p.name)).toEqual(['first', 'second']);
    });

    it('returns empty array when no plugin matches', () => {
      manager.register(createPlugin({ name: 'none', match: () => false }));
      const found = manager.findPlugins(makeMessage({ content: 'hello' }));
      expect(found).toEqual([]);
    });
  });

  describe('getPlugins', () => {
    it('returns an empty array when no plugins are registered', () => {
      expect(manager.getPlugins()).toEqual([]);
    });

    it('returns a copy that cannot mutate internal state', () => {
      manager.register(createPlugin());
      const plugins = manager.getPlugins();
      // Mutating the returned array should not affect the manager
      (plugins as MessageEvent[]).length = 0;
      expect(manager.getPlugins()).toHaveLength(1);
    });
  });

  describe('multi-reply plugins', () => {
    it('a plugin can return an array of replies', async () => {
      const multiPlugin = createPlugin({
        name: 'multi-reply',
        match: (c) => c.includes('multi'),
        handle: async () => [
          { type: 'text', content: 'reply 1' },
          { type: 'text', content: 'reply 2' },
        ],
      });
      manager.register(multiPlugin);
      const found = manager.findPlugin(makeMessage({ content: 'multi test' }));
      expect(found).toBeDefined();
      const result = await found!.handle(makeMessage({ content: 'multi test' }), env);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});
