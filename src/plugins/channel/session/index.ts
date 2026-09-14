import type {IncomingMessage} from '../../../core/message.js';
import type {PluginContext} from '../../../core/context.js';
import {resolveBotId, resolveBotName, resolveOwnerId} from '../../../core/bot.js';
import {handledReply, textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Plugin} from '../../runtime/types.js';
import {logger} from '../../../utils/logger.js';
import {isGroupSessionActive, setGroupSessionActive} from './store.js';

type SessionAction = 'enable' | 'disable' | 'status';

const ENABLE = new Set(['启用', '开机', '开始', '开', 'on', 'start', 'enable']);
const DISABLE = new Set(['停用', '关机', '停止', '关', '结束', 'off', 'stop', 'disable']);
const STATUS = new Set(['状态', 'status']);

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripBotPrefix(content: string, botName?: string, botId?: string): string {
    let text = content.trim();
    for (const token of [botName?.trim(), botId?.trim()]) {
        if (!token) continue;
        text = text.replace(new RegExp(`^[@＠]?\\s*${escapeRegExp(token)}[\\s,，:：]*`, 'u'), '').trim();
    }
    return text;
}

export function parseSessionAction(command: string): SessionAction | null {
    const normalized = command.trim().toLowerCase();
    if (!normalized) return null;
    if (ENABLE.has(command.trim()) || ENABLE.has(normalized)) return 'enable';
    if (DISABLE.has(command.trim()) || DISABLE.has(normalized)) return 'disable';
    if (STATUS.has(command.trim()) || STATUS.has(normalized)) return 'status';
    return null;
}

function commandOf(message: IncomingMessage, ctx: PluginContext): string {
    return stripBotPrefix(
        message.content?.trim() ?? '',
        resolveBotName(ctx.env),
        resolveBotId(ctx.env, message.platform),
    );
}

function ownerError(from: string, ownerId?: string): string | null {
    const owner = ownerId?.trim() ?? '';
    if (!owner) return '群里还没设主人，没法开';
    if (from.trim() !== owner) return '这事只有主人能定';
    return null;
}

export const groupSessionPlugin: Plugin = {
    manifest: {
        name: 'group-session',
        platforms: '*',
        kind: 'channel',
        priority: 5,
        impl: 'local',
    },
    async match(message, ctx) {
        if (message.source !== 'group' || !message.room?.id) return false;
        if (parseSessionAction(commandOf(message, ctx))) return true;
        return !(await isGroupSessionActive(ctx.env, message.platform, message.room.id));
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const roomId = message.room?.id;
        if (!roomId) return handledReply();

        const action = parseSessionAction(commandOf(message, ctx));
        if (!action) {
            return handledReply();
        }

        const denied = ownerError(message.from, resolveOwnerId(ctx.env, message.platform));
        if (denied) return textReply(denied);

        if (action === 'enable') {
            await setGroupSessionActive(ctx.env, message.platform, roomId, true);
            logger.info('群会话已开', {platform: message.platform, roomId});
            return textReply('好了，这个群继续聊');
        }
        if (action === 'disable') {
            await setGroupSessionActive(ctx.env, message.platform, roomId, false);
            logger.info('群会话已关', {platform: message.platform, roomId});
            return textReply('好了，这个群先歇着');
        }

        const on = await isGroupSessionActive(ctx.env, message.platform, roomId);
        return textReply(on ? '开着呢' : '歇着呢，发「开始」找我');
    },
};
