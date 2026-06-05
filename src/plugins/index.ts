/**
 * 插件入口。
 *
 * 导入本模块以确保所有内置插件注册到全局注册表。
 *
 * 推荐职责边界：
 * - `registry.ts`：插件注册表门面与查询 API
 * - `dispatcher.ts`：消息分发查询入口
 * - `manager.ts`：底层容器实现（通常无需直接依赖）
 */

import {registerPlugin} from './registry';
import {aiDialogPlugin} from './ai/ai-dialog';
import {videoLinkParserPlugin} from './video/video-link-parser';
import {videoRecommendationPlugin} from './video/video-recommendation';
import {helpPlugin} from './system/help';
import {pluginAdminPlugin} from './system/plugin-admin';
import {contactAdminPlugin} from './system/contact-admin';
import {humanVerifyPlugin} from './system/human-verify';
import {randomFriendPlugin} from './system/random-friend';
import {commonPluginsEngine} from './rule-engine/base';
import {dynamicCommonPluginsEngine} from './rule-engine/dynamic';
import {workflowCommonPluginsEngine} from './rule-engine/workflow';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './image/intent-image';
import {imageRecommendationPlugin} from './image/image-recommendation';
import {smartDrawPlugin} from './image/smart-draw';
import {yinguoImagePlugin} from './image/yinguo-image';
import {xiuxianPlugin} from './game/xiuxian';
import {wechatChatRecordDemoPlugin} from './demo/wechat-chat-record';
import {fakeForwardPlugin} from './wechat/fake-forward';
import {xuanxuePlugin} from './xuanxue';
import {aiSingPlugin} from './audio/ai-sing';

// ── 内置插件 ─────────────────────────────────────────────────────────────
registerPlugin(helpPlugin);
registerPlugin(contactAdminPlugin);
registerPlugin(humanVerifyPlugin);
registerPlugin(randomFriendPlugin);
registerPlugin(wechatChatRecordDemoPlugin);
registerPlugin(videoRecommendationPlugin);
registerPlugin(imageRecommendationPlugin);
registerPlugin(smartDrawPlugin);
registerPlugin(yinguoImagePlugin);
registerPlugin(pluginAdminPlugin);
// 通用插件配置
registerPlugin(commonPluginsEngine);
registerPlugin(dynamicCommonPluginsEngine);
registerPlugin(workflowCommonPluginsEngine);
registerPlugin(xiuxianPlugin);
registerPlugin(xuanxuePlugin);
// 自定义插件
registerPlugin(aiDialogPlugin);
registerPlugin(aiSingPlugin);
registerPlugin(videoLinkParserPlugin);
registerPlugin(imageIntentTriggerPlugin);
registerPlugin(imageIntentProcessPlugin);
registerPlugin(fakeForwardPlugin);

// 重新导出以便外部使用
export {
	findFirstRegisteredPlugin,
	findRegisteredPlugins,
	listRegisteredPlugins,
	registerPlugin,
	unregisterPlugin,
} from './registry';
export type {MessageEvent, TextMessage, ImageMessage} from './types.js';
