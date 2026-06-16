import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import type {HandlerResponse} from '../../types/reply.js';
import {setChatLogHandleMeta} from '../../chat-log/index.js';
import {findMatchingPlugins} from '../../plugins/dispatcher.js';
import {logger} from '../../utils/logger.js';

/**
 * 处理表情消息（微信 type 47）。
 */
export async function handleEmojiMessage(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const plugins = findMatchingPlugins(message);
    for (const plugin of plugins) {
        const result = await plugin.handle(message, env);
        if (result) {
            setChatLogHandleMeta(message, {pluginName: plugin.name});
            return result;
        }
    }

    logger.info('收到表情消息，但未命中表情插件。');
    return null;
}
