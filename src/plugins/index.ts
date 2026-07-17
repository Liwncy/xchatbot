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
import {agentBridgePlugin} from './cognitive/agent-bridge';
import {videoLinkParserPlugin} from './media/video-link-parser';
import {haokanVideoPlugin} from './media/haokan-video';
import {helpPlugin} from './system/help';
import {pluginAdminPlugin} from './system/plugin-admin';
import {contactAdminPlugin} from './system/contact-admin';
import {messageRevokePlugin} from './system/message-revoke';
import {notifyPlugin} from './system/notify';
import {appLogQueryPlugin} from './system/app-log-query';
import {humanVerifyPlugin} from './toolkits/human-verify';
import {randomFriendPlugin} from './toolkits/random-friend';
import {simpleRulesEngine} from './rule-engine/simple';
import {dynamicRulesEngine} from './rule-engine/dynamic';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './cognitive/intent-image';
import {haokanImagePlugin} from './media/haokan-image';
import {quickDrawPlugin} from './cognitive/quick-draw';
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
import {openClawXbotPlugin} from './cognitive/openclaw-xbot';

// ── 内置插件 ─────────────────────────────────────────────────────────────
registerPlugin(helpPlugin);
registerPlugin(contactAdminPlugin);
registerPlugin(messageRevokePlugin);
registerPlugin(notifyPlugin);
registerPlugin(appLogQueryPlugin);
registerPlugin(humanVerifyPlugin);
registerPlugin(randomFriendPlugin);
registerPlugin(wechatChatRecordDemoPlugin);
registerPlugin(haokanVideoPlugin);
registerPlugin(haokanImagePlugin);
registerPlugin(quickDrawPlugin);
registerPlugin(agnesDrawPlugin);
registerPlugin(agnesVideoPlugin);
registerPlugin(agnesTextTriggerPlugin);
registerPlugin(agnesTextEmojiProcessPlugin);
registerPlugin(agnesTextImageProcessPlugin);
registerPlugin(yinguoImagePlugin);
registerPlugin(pluginAdminPlugin);
// 规则引擎
registerPlugin(simpleRulesEngine);
registerPlugin(dynamicRulesEngine);
registerPlugin(xiuxianPlugin);
registerPlugin(xuanxuePlugin);
// OpenClaw 相关入口放在 ai-dialog 之前，避免被聊天插件先吃掉
registerPlugin(agentBridgePlugin);
registerPlugin(openClawXbotPlugin);
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
