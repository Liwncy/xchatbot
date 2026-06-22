import type {TextMessage} from '../../types.js';
import {
    buildRevokeHelpText,
    ensureOwner,
    parseRevokeCount,
    revokeBotMessages,
} from './service.js';

const REVOKE_HELP_COMMAND = '撤回帮助';

function matchesRevokeCommand(content: string, hasQuote: boolean): boolean {
    const trimmed = content.trim();
    if (trimmed === REVOKE_HELP_COMMAND) return true;
    if (/^撤回(?:\s+\d+)?$/u.test(trimmed)) return true;
    return hasQuote && /^撤回(?:\s+\d+)?$/u.test(trimmed);
}

export const messageRevokePlugin: TextMessage = {
    type: 'text',
    name: 'message-revoke',
    description: '机器人消息撤回（仅主人）：撤回 / 撤回 N / 引用后撤回',
    match: (content, message) => matchesRevokeCommand(content, Boolean(message.quote)),
    handle: async (message, env) => {
        try {
            const content = message.content?.trim() ?? '';
            const quoteTitle = message.quote?.title?.trim() ?? '';
            const commandText = quoteTitle || content;

            const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
            if (ownerErr) return {type: 'text', content: ownerErr};

            if (commandText === REVOKE_HELP_COMMAND || content === REVOKE_HELP_COMMAND) {
                return {type: 'text', content: buildRevokeHelpText()};
            }

            const count = parseRevokeCount(content, quoteTitle || undefined);
            const result = await revokeBotMessages(message, env, count);
            return {type: 'text', content: result};
        } catch {
            return {type: 'text', content: '没撤成，再试下 🙏'};
        }
    },
};
