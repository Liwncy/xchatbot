/**
 * 插件入口。
 *
 * 导入本模块以确保所有内置插件注册到全局 {@link pluginManager}。
 * 通过在此处调用 `pluginManager.register(yourPlugin)` 来添加新插件。
 */

import {pluginManager} from './manager.js';
import {catImagePlugin} from './demo/cat-image';
import {aiDialogPlugin} from './ai/ai-dialog';
import {todayWifePlugin} from './meitu/today-wife';
import {commonPluginsEngine} from './common/base';
import {dynamicCommonPluginsEngine} from './common/dynamic';
import {workflowCommonPluginsEngine} from './common/workflow';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './image/intent-image';

// ── 内置插件 ─────────────────────────────────────────────────────────────
pluginManager.register(workflowCommonPluginsEngine);
pluginManager.register(dynamicCommonPluginsEngine);
pluginManager.register(commonPluginsEngine);
pluginManager.register(aiDialogPlugin);
pluginManager.register(todayWifePlugin);
pluginManager.register(catImagePlugin);
pluginManager.register(imageIntentTriggerPlugin);
pluginManager.register(imageIntentProcessPlugin);

// 重新导出以便外部使用
export {pluginManager} from './manager.js';
export type {MessageEvent, TextMessage, ImageMessage} from './types.js';
