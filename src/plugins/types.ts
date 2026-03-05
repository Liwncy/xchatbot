import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/**
 * A text message plugin that can be registered with the PluginManager.
 *
 * Plugins are checked in registration order when a text message arrives.
 * The first plugin whose {@link match} returns `true` will handle the message.
 */
export interface TextPlugin {
  /** Unique plugin name used for registration and management. */
  name: string;
  /** Human-readable description of what the plugin does. */
  description: string;
  /**
   * Determine whether this plugin should handle the given text content.
   * @param content - The trimmed text content of the incoming message.
   * @param message - The full normalized incoming message.
   */
  match: (content: string, message: IncomingMessage) => boolean;
  /**
   * Process the message and return a reply (or `null` to skip replying).
   * @param message - The full normalized incoming message.
   * @param env     - Cloudflare Workers environment bindings.
   */
  handle: (message: IncomingMessage, env: Env) => Promise<ReplyMessage | null>;
}
