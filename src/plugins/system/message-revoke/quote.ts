import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {
    buildRevokeHelpText,
    ensureOwner,
    parseRevokeCount,
    revokeBotMessages,
} from './service.js';

const REVOKE_HELP_COMMAND = '撤回帮助';

export function matchesMessageRevokeQuote(message: IncomingMessage): boolean {
    const title = message.quote?.title?.trim() ?? '';
    if (!title) return false;
    return title === REVOKE_HELP_COMMAND || /^撤回(?:\s+\d+)?$/u.test(title);
}

export async function handleMessageRevokeQuote(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    if (!matchesMessageRevokeQuote(message)) return null;

    const quoteTitle = message.quote?.title?.trim() ?? '';
    const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
    if (ownerErr) return {type: 'text', content: ownerErr};

    if (quoteTitle === REVOKE_HELP_COMMAND) {
        return {type: 'text', content: buildRevokeHelpText()};
    }

    const count = parseRevokeCount('', quoteTitle);
    const result = await revokeBotMessages(message, env, count);
    return {type: 'text', content: result};
}
