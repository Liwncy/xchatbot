import type { IncomingMessage, ReplyMessage, Env } from '../types/message.js';

/** Base fields shared by all message event handlers. */
interface BaseMessageEvent {
  /** Unique handler name used for registration and management. */
  name: string;
  /** Human-readable description of what the handler does. */
  description: string;
  /**
   * Process the message and return a reply (or `null` to skip replying).
   * @param message - The full normalized incoming message.
   * @param env     - Cloudflare Workers environment bindings.
   */
  handle: (message: IncomingMessage, env: Env) => Promise<ReplyMessage | null>;
}

/**
 * Event handler for text messages.
 *
 * Matches against the trimmed text content of incoming text messages.
 */
export interface TextMessage extends BaseMessageEvent {
  type: 'text';
  /**
   * Determine whether this handler should process the given text content.
   * @param content - The trimmed text content of the incoming message.
   * @param message - The full normalized incoming message.
   */
  match: (content: string, message: IncomingMessage) => boolean;
}

/**
 * Event handler for image messages.
 *
 * Matches against incoming image messages.
 */
export interface ImageMessage extends BaseMessageEvent {
  type: 'image';
  /**
   * Determine whether this handler should process the given image message.
   * @param message - The full normalized incoming message.
   */
  match: (message: IncomingMessage) => boolean;
}

/**
 * Union of all message event types.
 *
 * Event handlers are checked in registration order when a message arrives.
 * The first handler whose {@link TextMessage.match | match} returns `true`
 * will handle the message.
 */
export type MessageEvent = TextMessage | ImageMessage;
