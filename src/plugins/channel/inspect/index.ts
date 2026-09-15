import type {IncomingMessage} from '../../../core/message.js';
import type {PluginContext} from '../../../core/context.js';
import {resolveOwnerId} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import {searchChatHistory} from '../../../core/chat-log/search.js';
import {searchAppLogs} from '../../../core/app-log/search.js';
import type {Plugin} from '../../runtime/types.js';
import {parseInspectCommand, type InspectCommand} from './parse.js';

const CLIP = 3500;
const HISTORY_HELP = [
    '翻这屋刚才的话：#查记录',
    '某天：#查记录 8-29',
    '某人：#查记录 李芈仙',
    '搜词：#查记录 搜 咖啡',
    '近几小时：#查记录 近3小时',
    '只要图：#查记录 图片',
].join('\n');
const LOG_HELP = [
    '刚才怎么失败：#查日志',
    '只要报错：#查日志 报错',
    '某天：#查日志 8-29',
].join('\n');

function commandOf(message: IncomingMessage, ctx: PluginContext): string | null {
    return markedCommand(message, ctx.env);
}

function scopeOf(message: IncomingMessage): string {
    return message.source === 'group'
        ? `group:${message.room?.id ?? ''}`
        : `user:${message.from}`;
}

function clipText(text: string): string {
    const raw = text.trim();
    if (raw.length <= CLIP) return raw;
    return `${raw.slice(0, CLIP)}\n……太长了，再加某人、搜词，或少拿几条`;
}

function ownerError(message: IncomingMessage, ctx: PluginContext): string | null {
    const ownerId = resolveOwnerId(ctx.env, message.platform);
    if (!ownerId) return '这个我还不能听你的';
    if (message.from.trim() !== ownerId) return '这事只有主人能看';
    return null;
}

async function runQuery(
    message: IncomingMessage,
    ctx: PluginContext,
    command: InspectCommand,
): Promise<string> {
    if (command.help) return command.kind === 'log' ? LOG_HELP : HISTORY_HELP;
    const scope = scopeOf(message);
    if (command.kind === 'log') {
        return searchAppLogs(ctx.env, {
            scope,
            platform: message.platform,
            date: command.date,
            hours: command.hours,
            keyword: command.keyword,
            level: command.level,
            limit: command.limit,
        });
    }
    return searchChatHistory(ctx.env, {
        scope,
        platform: message.platform,
        date: command.date,
        hours: command.hours,
        speaker: command.speaker,
        keyword: command.keyword,
        msgType: command.msgType,
        limit: command.limit ?? 20,
        direction: 'inbound',
    });
}

export const inspectPlugin: Plugin = {
    manifest: {
        name: 'inspect',
        platforms: '*',
        kind: 'channel',
        priority: 4,
        impl: 'local',
    },
    match(message, ctx) {
        if (message.type !== 'text') return false;
        return parseInspectCommand(commandOf(message, ctx) ?? '') != null;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = parseInspectCommand(commandOf(message, ctx) ?? '');
        if (!command) return null;
        const denied = ownerError(message, ctx);
        if (denied) return textReply(denied);
        try {
            return textReply(clipText(await runQuery(message, ctx, command)));
        } catch {
            return textReply(command.kind === 'log' ? '日志没查成，再试下' : '没翻成，再试下');
        }
    },
};
