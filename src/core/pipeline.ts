import type {IncomingMessage} from './message.js';
import type {HandlerResponse} from './reply.js';
import type {PluginContext} from './context.js';
import {KIND_ORDER, loadDisabledNames, selectPlugins} from '../plugins/runtime/index.js';
import {logger} from '../utils/logger.js';

export async function runPipeline(
    message: IncomingMessage,
    ctx: PluginContext,
): Promise<HandlerResponse> {
    const disabled = await loadDisabledNames(ctx.env);

    for (const kind of KIND_ORDER) {
        const plugins = selectPlugins(kind, message.platform, disabled);
        for (const plugin of plugins) {
            const matched = await plugin.match(message, ctx);
            if (!matched) continue;

            const response = await plugin.handle(message, ctx);
            if (response === null) continue;

            logger.info('插件命中', {
                kind,
                name: plugin.manifest.name,
                messageId: message.messageId,
            });
            return response;
        }
    }

    return null;
}
