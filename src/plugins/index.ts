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
import {aiDialogPlugin} from './cognitive/ai-dialog';
import {videoLinkParserPlugin} from './media/video-link-parser';
import {haokanVideoPlugin} from './media/haokan-video';
import {helpPlugin} from './system/help';
import {pluginAdminPlugin} from './system/plugin-admin';
import {contactAdminPlugin} from './system/contact-admin';
import {humanVerifyPlugin} from './toolkits/human-verify';
import {randomFriendPlugin} from './toolkits/random-friend';
import {commonPluginsEngine} from './rule-engine/base';
import {dynamicCommonPluginsEngine} from './rule-engine/dynamic';
import {workflowCommonPluginsEngine} from './rule-engine/workflow';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './cognitive/intent-image';
import {haokanImagePlugin} from './media/haokan-image';
import {smartDrawPlugin} from './cognitive/smart-draw';
import {agnesDrawPlugin} from './cognitive/agnes-draw';
import {agnesVideoPlugin} from './cognitive/agnes-video';
import {
    agnesTextEmojiProcessPlugin,
    agnesTextImageProcessPlugin,
    agnesTextTriggerPlugin,
} from './cognitive/agnes-text';
import {yinguoImagePlugin} from './media/yinguo-image';
import {xiuxianPlugin} from './scenarios/xiuxian';
import {wechatChatRecordDemoPlugin} from './toolkits/wechat-chat-record';
import {fakeForwardPlugin} from './toolkits/fake-forward';
import {emojiStashProcessPlugin, emojiStashTriggerPlugin} from './toolkits/emoji-stash';
import {xuanxuePlugin} from './scenarios/xuanxue';
import {aiSingPlugin} from './cognitive/ai-sing';

// ── 内置插件 ─────────────────────────────────────────────────────────────
registerPlugin(helpPlugin);
registerPlugin(contactAdminPlugin);
registerPlugin(humanVerifyPlugin);
registerPlugin(randomFriendPlugin);
registerPlugin(wechatChatRecordDemoPlugin);
registerPlugin(haokanVideoPlugin);
registerPlugin(haokanImagePlugin);
registerPlugin(agnesDrawPlugin);
registerPlugin(agnesVideoPlugin);
registerPlugin(agnesTextTriggerPlugin);
registerPlugin(agnesTextEmojiProcessPlugin);
registerPlugin(agnesTextImageProcessPlugin);
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
registerPlugin(emojiStashProcessPlugin);
registerPlugin(imageIntentProcessPlugin);
registerPlugin(emojiStashTriggerPlugin);
registerPlugin(fakeForwardPlugin);

// 重新导出以便外部使用
export {
	findFirstRegisteredPlugin,
	findRegisteredPlugins,
	listRegisteredPlugins,
	registerPlugin,
	unregisterPlugin,
} from './registry';
export type {MessageEvent, TextMessage, ImageMessage, EmojiMessage} from './types.js';
