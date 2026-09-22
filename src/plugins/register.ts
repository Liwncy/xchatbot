import {registerPlugin} from './runtime/index.js';
import {emojiCollectPlugin} from './channel/emoji-collect/index.js';
import {emojiStashPlugin} from './channel/emoji-stash/index.js';
import {hongbaoPlugin} from './channel/hongbao/index.js';
import {groupSessionPlugin} from './channel/session/index.js';
import {inspectPlugin} from './channel/inspect/index.js';
import {roleplayPlugin} from './channel/roleplay/index.js';
import {revokePlugin} from './channel/revoke/index.js';
import {randomFriendPlugin} from './channel/random-friend/index.js';
import {fakeForwardPlugin} from './channel/fake-forward/index.js';
import {mcpToolsCommandPlugin} from './command/mcp-tools/index.js';
import {unknownCommandPlugin} from './command/unknown/index.js';
import {openclawAgentPlugin} from './agent/openclaw/index.js';
import {qwenpawAgentPlugin} from './agent/qwenpaw/index.js';
import {snailaiAgentPlugin} from './agent/snailai/index.js';

// channel：表情入库 / 表情口令 / 红包 / 群门禁 / #查记录 / #扮演 / #撤回 / 随机朋友 / 伪转发，不进大脑
// 花名册先手记，不自动候审
// command：# 快捷调用 MCP；未识别的 #口令在此拦下
// agent：只把 core 已拼好的正文交给当前大脑（OpenClaw / SnailAI / QwenPaw）

let registered = false;

export function ensurePluginsRegistered(): void {
    if (registered) return;
    registerPlugin(emojiCollectPlugin);
    registerPlugin(emojiStashPlugin);
    registerPlugin(hongbaoPlugin);
    registerPlugin(groupSessionPlugin);
    registerPlugin(inspectPlugin);
    registerPlugin(roleplayPlugin);
    registerPlugin(revokePlugin);
    registerPlugin(randomFriendPlugin);
    registerPlugin(fakeForwardPlugin);
    registerPlugin(mcpToolsCommandPlugin);
    registerPlugin(unknownCommandPlugin);
    registerPlugin(openclawAgentPlugin);
    registerPlugin(snailaiAgentPlugin);
    registerPlugin(qwenpawAgentPlugin);
    registered = true;
}
