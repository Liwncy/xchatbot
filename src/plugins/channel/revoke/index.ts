import type {IncomingMessage} from '../../../core/message.js';
import type {PluginContext} from '../../../core/context.js';
import {resolveBotId, resolveBotName, resolveOwnerId} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {RevokeReason} from '../../../adapter/types.js';
import type {Plugin} from '../../runtime/types.js';
import {logger} from '../../../utils/logger.js';

const HELP_COMMAND = '撤回帮助';
const NO_PERMISSION = '哼，你不配！';

const REVOKE_COPY: Record<RevokeReason, string> = {
    unsupported: '这头还撤不了',
    incomplete: '引用里没带消息 id，撤不了 🤔',
    unavailable: '这会儿撤不了，等一下',
    expired: '撤不了，太久了 😅',
    failed: '没撤成，再试下',
};

function revokeCommand(message: IncomingMessage, ctx: PluginContext): string | null {
    return markedCommand(message, ctx.env);
}

function matchesRevokeCommand(command: string | null): boolean {
    if (command == null) return false;
    if (command === HELP_COMMAND) return true;
    return /^撤回(?:\s+\d+)?$/u.test(command);
}

function ensureOwner(from: string, ownerId?: string): string | null {
    const owner = ownerId?.trim() ?? '';
    if (!owner) return '这个我还不能听你的';
    if (from.trim() !== owner) return NO_PERMISSION;
    return null;
}

function isQuotedBotMessage(message: IncomingMessage, ctx: PluginContext): boolean {
    const quote = message.quote;
    if (!quote) return false;
    const botId = resolveBotId(ctx.env, message.platform);
    const referFrom = quote.referFrom?.trim() ?? '';
    if (botId && referFrom && referFrom === botId) return true;
    const botName = resolveBotName(ctx.env);
    const referSenderName = quote.referSenderName?.trim() ?? '';
    return Boolean(botName && referSenderName && referSenderName === botName);
}

export const revokePlugin: Plugin = {
    manifest: {
        name: 'revoke',
        platforms: '*',
        kind: 'channel',
        priority: 10,
        impl: 'local',
    },
    match(message, ctx) {
        if (message.type !== 'text' && message.type !== 'link') return false;
        return matchesRevokeCommand(revokeCommand(message, ctx));
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        try {
            const ownerErr = ensureOwner(message.from, resolveOwnerId(ctx.env, message.platform));
            if (ownerErr) return textReply(ownerErr);

            const text = revokeCommand(message, ctx) ?? '';
            if (text === HELP_COMMAND) {
                return textReply([
                    '撤我发的：',
                    '引用我发的那条，再发「#撤回」',
                    '',
                    '按条数撤还没接上，先引用再撤',
                ].join('\n'));
            }

            if (!message.quote) {
                return textReply('先引用那条再撤');
            }
            if (!isQuotedBotMessage(message, ctx)) {
                return textReply('只能撤我发的，别人的撤不了 🤔');
            }

            const adapter = ctx.adapter;
            if (!adapter) {
                return textReply(REVOKE_COPY.unsupported);
            }

            const result = await adapter.revoke(message, ctx.env);
            if (result.ok) return textReply('嗯，这条撤了 👌');
            return textReply(REVOKE_COPY[result.reason ?? 'failed']);
        } catch (error) {
            logger.error('撤回失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return textReply(REVOKE_COPY.failed);
        }
    },
};
