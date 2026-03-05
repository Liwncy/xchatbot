import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../../src/plugins/manager.js';
import type { TextPlugin } from '../../src/plugins/types.js';
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

function createPlugin(overrides: Partial<TextPlugin> = {}): TextPlugin {
  return {
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
      const found = manager.findPlugin('hello', makeMessage());
      expect(found?.name).toBe('alpha');
    });

    it('returns undefined when no plugin matches', () => {
      manager.register(createPlugin({ match: (c) => c.includes('xyz') }));
      const found = manager.findPlugin('no match here', makeMessage());
      expect(found).toBeUndefined();
    });

    it('skips non-matching plugins and finds a later one', () => {
      manager.register(createPlugin({ name: 'no-match', match: () => false }));
      manager.register(createPlugin({ name: 'yes-match', match: () => true }));
      const found = manager.findPlugin('anything', makeMessage());
      expect(found?.name).toBe('yes-match');
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
      (plugins as TextPlugin[]).length = 0;
      expect(manager.getPlugins()).toHaveLength(1);
    });
  });
});
