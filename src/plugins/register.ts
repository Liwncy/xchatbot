import {registerPlugin} from './runtime/index.js';
import {groupSessionPlugin} from './channel/session/index.js';
import {revokePlugin} from './channel/revoke/index.js';
import {xiuxianCommandPlugin} from './command/xiuxian/index.js';
import {openclawAgentPlugin} from './agent/openclaw/index.js';

let registered = false;

export function ensurePluginsRegistered(): void {
    if (registered) return;
    registerPlugin(groupSessionPlugin);
    registerPlugin(revokePlugin);
    registerPlugin(xiuxianCommandPlugin);
    registerPlugin(openclawAgentPlugin);
    registered = true;
}
