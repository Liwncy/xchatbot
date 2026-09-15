import type {IncomingMessage} from '../../../core/message.js';
import type {PluginContext} from '../../../core/context.js';
import {resolveBotId, resolveBotName, resolveOwnerId} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import {handledReply, textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {logger} from '../../../utils/logger.js';
import {isBotMentioned} from './mention.js';
import {
    allowsGroupMessage,
    DEFAULT_REPLY_CHANCE,
    followUpApplies,
    matchesKeyword,
    matchesRuleUser,
    modeLabel,
    parseGroupCommand,
    rollChance,
    type GroupCommand,
    type GroupSettings,
} from './policy.js';
import {tryHandleRoleplay} from '../../../core/roleplay/index.js';
import {
    ensureGroupSettings,
    getGroupSettings,
    isFollowActive,
    isGroupSessionActive,
    saveGroupSettings,
    setGroupSessionActive,
    touchFollowWindow,
} from './store.js';

function commandOf(message: IncomingMessage, ctx: PluginContext): string | null {
    return markedCommand(message, ctx.env);
}

function ownerError(from: string, ownerId: string | undefined, emptyCopy: string): string | null {
    const owner = ownerId?.trim() ?? '';
    if (!owner) return emptyCopy;
    if (from.trim() !== owner) return '这事只有主人能定';
    return null;
}

async function applyCommand(
    command: GroupCommand,
    message: IncomingMessage,
    ctx: PluginContext,
    roomId: string,
): Promise<HandlerResponse> {
    const isSession = command.kind === 'enable' || command.kind === 'disable' || command.kind === 'status';
    const denied = ownerError(
        message.from,
        resolveOwnerId(ctx.env, message.platform),
        isSession ? '群里还没设主人，没法开' : '群里还没设主人，没法改模式',
    );
    if (denied) return textReply(denied);

    if (command.kind === 'enable') {
        await setGroupSessionActive(ctx.env, message.platform, roomId, true);
        await ensureGroupSettings(ctx.env, message.platform, roomId);
        logger.info('群会话已开', {platform: message.platform, roomId});
        return textReply('好了，这个群继续聊');
    }
    if (command.kind === 'disable') {
        await setGroupSessionActive(ctx.env, message.platform, roomId, false);
        logger.info('群会话已关', {platform: message.platform, roomId});
        return textReply('好了，这个群先歇着');
    }
    if (command.kind === 'status') {
        const on = await isGroupSessionActive(ctx.env, message.platform, roomId);
        const settings = await getGroupSettings(ctx.env, message.platform, roomId);
        return textReply(`${on ? '开着呢' : '歇着呢'}；模式「${modeLabel(settings.mode)}」`);
    }
    if (command.kind === 'unknown-help') {
        return textReply('没听懂，再发一次？ 🤔');
    }

    const current = await getGroupSettings(ctx.env, message.platform, roomId);
    const next = applySettingsCommand(current, command);
    await saveGroupSettings(ctx.env, message.platform, roomId, next);
    logger.info('群策略已改', {
        platform: message.platform,
        roomId,
        kind: command.kind,
        mode: next.mode,
        chance: next.replyChancePercent,
        follow: next.followUpSeconds,
    });
    if (command.kind === 'set-mode') {
        return textReply(`好了，换成「${modeLabel(command.mode)}」了 👌`);
    }
    return textReply('好了 👌');
}

function applySettingsCommand(current: GroupSettings, command: GroupCommand): GroupSettings {
    switch (command.kind) {
        case 'set-mode': {
            const chance = (command.mode === 'random' || command.mode === 'smart')
                && current.replyChancePercent <= 0
                ? DEFAULT_REPLY_CHANCE
                : current.replyChancePercent;
            return {...current, mode: command.mode, replyChancePercent: chance};
        }
        case 'set-chance':
            return {
                ...current,
                replyChancePercent: command.percent,
                mode: current.mode === 'smart' ? 'smart' : 'random',
            };
        case 'set-follow':
            return {...current, followUpSeconds: command.seconds};
        case 'set-users':
            return {...current, userIds: command.userIds, mode: 'rule'};
        case 'set-keywords':
            return {...current, keywords: command.keywords, mode: 'rule'};
        case 'clear-rule':
            return {...current, userIds: [], keywords: []};
        default:
            return current;
    }
}

export const groupSessionPlugin: Plugin = {
    manifest: {
        name: 'group-session',
        platforms: '*',
        kind: 'channel',
        priority: 5,
        impl: 'local',
    },
    async match(message) {
        return message.source === 'group' && Boolean(message.room?.id);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const roomId = message.room?.id;
        if (!roomId) return handledReply();

        const marked = commandOf(message, ctx);
        if (marked != null) {
            const command = parseGroupCommand(marked);
            if (command) return applyCommand(command, message, ctx, roomId);
        }

        const settings = await getGroupSettings(ctx.env, message.platform, roomId);
        const mentioned = isBotMentioned(
            message,
            resolveBotName(ctx.env),
            resolveBotId(ctx.env, message.platform),
        );
        const followOn = followUpApplies(settings.mode) && settings.followUpSeconds > 0;
        const followActive = followOn
            && await isFollowActive(ctx.env, message.platform, roomId, message.from);
        const listed = matchesRuleUser(settings, message.from)
            || matchesKeyword(settings, message.content ?? '');
        const needChance = settings.mode === 'random' || settings.mode === 'smart';
        const chanceHit = needChance && rollChance(settings.replyChancePercent);
        const allowed = allowsGroupMessage(settings, {
            mentioned,
            followActive,
            listed,
            chanceHit,
        });
        const ownerId = resolveOwnerId(ctx.env, message.platform);
        const isOwner = Boolean(ownerId && message.from.trim() === ownerId);
        if (marked != null) {
            const roleplayReply = await tryHandleRoleplay(ctx.env, message, marked);
            if (roleplayReply) {
                if (isOwner || allowed) return textReply(roleplayReply);
                return textReply('这会儿先不演');
            }
            return null;
        }

        const active = await isGroupSessionActive(ctx.env, message.platform, roomId);
        if (!active) return handledReply();
        if (!allowed) {
            logger.info('群策略未放行', {
                platform: message.platform,
                roomId,
                mode: settings.mode,
                mentioned,
                followActive,
                listed,
                chanceHit,
            });
            return handledReply();
        }

        if (followOn && (mentioned || followActive)) {
            await touchFollowWindow(
                ctx.env,
                message.platform,
                roomId,
                message.from,
                settings.followUpSeconds,
            );
        }
        return null;
    },
};
