/**
 * Plugin entry-point.
 *
 * Import this module to ensure every built-in plugin is registered with the
 * global {@link pluginManager}.  Add new plugins by calling
 * `pluginManager.register(yourPlugin)` here.
 */

import { pluginManager } from './manager.js';
import { catImagePlugin } from './cat-image.js';

// ── Built-in plugins ────────────────────────────────────────────────────
pluginManager.register(catImagePlugin);

// Re-export for convenience
export { pluginManager } from './manager.js';
export type { MessageEvent, TextMessage, ImageMessage } from './types.js';
