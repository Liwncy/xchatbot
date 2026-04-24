/**
 * 插件入口。
 *
 * 导入本模块以确保所有内置插件注册到全局 {@link pluginManager}。
 * 通过在此处调用 `pluginManager.register(yourPlugin)` 来添加新插件。
 */

import {pluginManager} from './manager.js';
import {aiDialogPlugin} from './ai/ai-dialog';
import {videoLinkParserPlugin} from './video/video-link-parser';
import {videoRecommendationPlugin} from './video/video-recommendation';
import {helpPlugin} from './system/help';
import {commonPluginsEngine} from './common/base';
import {dynamicCommonPluginsEngine} from './common/dynamic';
import {workflowCommonPluginsEngine} from './common/workflow';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './image/intent-image';
import {xiuxianPlugin} from './game/xiuxian';
import {wechatChatRecordDemoPlugin} from './demo/wechat-chat-record';

// ── 内置插件 ─────────────────────────────────────────────────────────────
pluginManager.register(helpPlugin);
pluginManager.register(wechatChatRecordDemoPlugin);
pluginManager.register(videoRecommendationPlugin);
// 通用插件配置
pluginManager.register(commonPluginsEngine);
pluginManager.register(dynamicCommonPluginsEngine);
pluginManager.register(workflowCommonPluginsEngine);
pluginManager.register(xiuxianPlugin);
// 自定义插件
pluginManager.register(aiDialogPlugin);
pluginManager.register(videoLinkParserPlugin);
pluginManager.register(imageIntentTriggerPlugin);
pluginManager.register(imageIntentProcessPlugin);

// 重新导出以便外部使用
export {pluginManager} from './manager.js';
export type {MessageEvent, TextMessage, ImageMessage} from './types.js';
