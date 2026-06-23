import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {
    buildNotifyHelpText,
    matchesNotifyCommand,
    NOTIFY_HELP_COMMAND,
    parseNotifyCommand,
    sendNotifyMessage,
} from './service.js';

export function matchesNotifyQuote(message: IncomingMessage): boolean {
    const title = message.quote?.title?.trim() ?? '';
    return Boolean(title) && matchesNotifyCommand(title);
}

export async function handleNotifyQuote(message: IncomingMessage, env: Env): Promise<HandlerResponse | null> {
    if (!matchesNotifyQuote(message)) return null;

    try {
        const title = message.quote?.title?.trim() ?? '';
        if (title === NOTIFY_HELP_COMMAND) {
            return {type: 'text', content: buildNotifyHelpText()};
        }

        const command = parseNotifyCommand(title, message);
        if (!command) return {type: 'text', content: buildNotifyHelpText()};

        const result = await sendNotifyMessage(message, env, command);
        return {type: 'text', content: result};
    } catch {
        return {type: 'text', content: '没发成，再试下 🙏'};
    }
}
