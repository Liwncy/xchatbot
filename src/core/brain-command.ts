import type {Env} from '../types/env.js';
import {resolveOwnerId} from './bot.js';
import type {IncomingMessage} from './message.js';
import {
    clearPlatformBrain,
    clearSessionBrain,
    clearSessionBrainsOfPlatform,
    currentBrain,
    lookupBrain,
    setDefaultBrain,
    setPlatformBrain,
    setSessionBrain,
} from './brain-store.js';

const COMMAND = /^脑子(?:\s+([\s\S]+))?$/u;

type BrainCommand =
    | {action: 'query'}
    | {action: 'set'; scope: 'session' | 'platform' | 'default'; name: string; force?: boolean}
    | {action: 'clear'; scope: 'session' | 'platform'}
    | {action: 'reject-default'}
    | {action: 'need-name'};

function parseBrainCommand(command: string): BrainCommand | null {
    const match = COMMAND.exec(command.trim());
    if (!match) return null;
    const rest = match[1]?.trim() ?? '';
    if (!rest) return {action: 'query'};
    const parts = rest.split(/\s+/u);
    if (parts[0] === '平台') {
        if (parts.length === 2 && parts[1] === '取消') return {action: 'clear', scope: 'platform'};
        if (parts.length === 2) return {action: 'set', scope: 'platform', name: parts[1]};
        if (parts.length === 3 && parts[2] === '强制') {
            return {action: 'set', scope: 'platform', name: parts[1], force: true};
        }
        return {action: 'need-name'};
    }
    if (parts[0] === '全部') {
        if (parts.length === 2 && parts[1] === '取消') return {action: 'reject-default'};
        if (parts.length === 2) return {action: 'set', scope: 'default', name: parts[1]};
        return {action: 'need-name'};
    }
    if (parts.length === 1 && parts[0] === '取消') return {action: 'clear', scope: 'session'};
    if (parts.length === 1) return {action: 'set', scope: 'session', name: parts[0]};
    return {action: 'need-name'};
}

export async function tryHandleBrain(
    env: Env,
    message: IncomingMessage,
    commandText: string,
): Promise<string | null> {
    if (message.type !== 'text') return null;
    const command = parseBrainCommand(commandText.trim());
    if (!command) return null;
    const ownerId = resolveOwnerId(env, message.platform);
    if (!ownerId || message.senderId.trim() !== ownerId) return '这事只有主人能定';

    if (command.action === 'need-name') return '说一颗，比如 Hermes';
    if (command.action === 'reject-default') return '默认得换成另一颗';

    if (command.action === 'query') {
        const current = await currentBrain(env, message);
        if (current.layer === 'session') return `这个会话是 ${current.displayName}`;
        if (current.layer === 'platform') return `这个平台是 ${current.displayName}`;
        return `默认是 ${current.displayName}`;
    }

    if (command.action === 'clear') {
        if (command.scope === 'session') await clearSessionBrain(env, message);
        else await clearPlatformBrain(env, message.platform);
        return command.scope === 'session' ? '好，这个会话不单独定了' : '好，这个平台不单独定了';
    }

    const brain = await lookupBrain(env, command.name);
    if (!brain) return '没这颗';
    if (!brain.kind) return '这颗还没标类型';
    if (!brain.enabled) return '这颗先不用';

    if (command.scope === 'session') {
        await setSessionBrain(env, message, brain.key);
        return `好，这个会话换成 ${brain.displayName}`;
    }
    if (command.scope === 'platform') {
        await setPlatformBrain(env, message.platform, brain.key);
        if (!command.force) return `好，这个平台换成 ${brain.displayName}`;
        const cleared = await clearSessionBrainsOfPlatform(env, message.platform);
        return cleared > 0
            ? `好，这个平台换成 ${brain.displayName}，${cleared} 个单独定过的会话也跟上了`
            : `好，这个平台换成 ${brain.displayName}`;
    }
    await setDefaultBrain(env, brain.key);
    return `好，默认换成 ${brain.displayName}`;
}
