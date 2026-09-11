import {registerPlugin} from './runtime/index.js';
import {revokePlugin} from './channel/golem/revoke/index.js';
import {xiuxianCommandPlugin} from './command/xiuxian/index.js';
import {openclawAgentPlugin} from './agent/openclaw/index.js';

let registered = false;

export function ensurePluginsRegistered(): void {
    if (registered) return;
    registerPlugin(revokePlugin);
    registerPlugin(xiuxianCommandPlugin);
    registerPlugin(openclawAgentPlugin);
    registered = true;
}
