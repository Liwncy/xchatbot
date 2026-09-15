import {registerPlugin} from './runtime/index.js';
import {groupSessionPlugin} from './channel/session/index.js';
import {roleplayPlugin} from './channel/roleplay/index.js';
import {revokePlugin} from './channel/revoke/index.js';
import {xiuxianCommandPlugin} from './command/xiuxian/index.js';
import {openclawAgentPlugin} from './agent/openclaw/index.js';

// channel：群门禁 / 演法口令 / 撤回，不进大脑
// command：紧前缀快路径
// agent：只把 core 已拼好的正文交给当前大脑

let registered = false;

export function ensurePluginsRegistered(): void {
    if (registered) return;
    registerPlugin(groupSessionPlugin);
    registerPlugin(roleplayPlugin);
    registerPlugin(revokePlugin);
    registerPlugin(xiuxianCommandPlugin);
    registerPlugin(openclawAgentPlugin);
    registered = true;
}
