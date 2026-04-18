import type {IncomingMessage, HandlerResponse} from '../../../../types/message.js';
import {tryLoadSetConfigFromKv} from './config.js';
import {
    identityFromMessage,
} from './context.js';
import {handleXiuxianError} from './errors.js';
import {routeXiuxianCommand} from './router.js';
import type {
    XiuxianCommand,
} from '../core/types/index.js';
import {XiuxianRepository} from '../core/repository/index.js';

export async function handleXiuxianCommand(
    db: D1Database,
    kv: KVNamespace | undefined,
    message: IncomingMessage,
    cmd: XiuxianCommand,
): Promise<HandlerResponse> {
    const repo = new XiuxianRepository(db);
    const now = Date.now();
    const identity = identityFromMessage(message);
    await tryLoadSetConfigFromKv(kv, now);

    try {
        return routeXiuxianCommand(repo, message, cmd, {identity, now});
    } catch (error) {
        return handleXiuxianError(message, error);
    }
}

