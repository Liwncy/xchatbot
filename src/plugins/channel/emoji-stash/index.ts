import {resolveBotName, resolveOwnerId} from '../../../core/bot.js';
import {getChatMessagesById} from '../../../core/chat-log/store.js';
import {markedCommand} from '../../../core/command-mark.js';
import {
    emojiBan,
    emojiListAll,
    emojiPickByName,
    emojiPickRandom,
    extractEmojiBracketCommand,
    type EmojiBracketCommand,
} from '../../../core/emoji-stash/index.js';
import type {IncomingMessage} from '../../../core/message.js';
import {emojiReply, textReply, type HandlerResponse} from '../../../core/reply.js';
import type {PluginContext} from '../../../core/context.js';
import type {Env} from '../../../types/env.js';
import type {Plugin} from '../../runtime/types.js';
import {buildEmojiListCard} from './card.js';

function commandText(message: IncomingMessage, ctx: PluginContext): string {
    return markedCommand(message, ctx.env) ?? '';
}

function md5Of(text: string): string {
    const match = /\b([0-9a-f]{32})\b/iu.exec(text.trim());
    return match?.[1]?.toLowerCase() ?? '';
}

function quotedMd5(message: IncomingMessage): string {
    const fromMedia = message.quote?.media?.md5?.trim().toLowerCase() ?? '';
    if (/^[0-9a-f]{32}$/u.test(fromMedia)) return fromMedia;
    return md5Of(message.quote?.referContent ?? '')
        || md5Of(message.rawXml ?? '');
}

function quotedImgUrl(message: IncomingMessage): string {
    return message.quote?.media?.publicUrl?.trim()
        || message.quote?.media?.url?.trim()
        || '';
}

async function resolveQuotedMd5(env: Env, message: IncomingMessage): Promise<string> {
    const direct = quotedMd5(message);
    if (direct) return direct;
    const referId = message.quote?.referMessageId?.newIdText
        ?? (message.quote?.referMessageId?.newId != null
            ? String(message.quote.referMessageId.newId)
            : '');
    if (!referId) return '';
    const rows = await getChatMessagesById(env, referId);
    for (const row of rows) {
        try {
            const payload = row.payloadJson ? JSON.parse(row.payloadJson) as {media?: {md5?: string}} : {};
            const md5 = payload.media?.md5?.trim().toLowerCase() ?? '';
            if (/^[0-9a-f]{32}$/u.test(md5)) return md5;
        } catch {
            // ignore broken payload
        }
        const fromText = md5Of(row.contentText);
        if (fromText) return fromText;
    }
    return '';
}

function parseBan(text: string): {hit: boolean; name?: string; md5?: string} {
    const matched = text.trim().match(/^禁表情(?:\s+(.+))?$/u);
    if (!matched) return {hit: false};
    const rest = matched[1]?.trim() ?? '';
    const md5 = md5Of(rest);
    return {hit: true, md5: md5 || undefined, name: md5 ? undefined : rest || undefined};
}

function sendable(item: {md5?: string | null; imgUrl?: string}): HandlerResponse {
    const md5 = item.md5?.trim() ?? '';
    if (!md5) return textReply('没找着能发的');
    return emojiReply(md5, item.imgUrl);
}

async function sendBracket(env: PluginContext['env'], command: EmojiBracketCommand): Promise<HandlerResponse> {
    const picked = command.type === 'name'
        ? await emojiPickByName(env, command.value)
        : command.type === 'category'
            ? await emojiPickRandom(env, {category: command.value})
            : await emojiPickRandom(env, {tag: command.value});
    if (picked.ok) return sendable(picked.item);
    if (picked.reason === 'banned') return textReply('这张禁了');
    if (picked.reason === 'bad-category') return textReply('没这个类 🤔');
    return textReply('没找着这张 🤔');
}

export const emojiStashPlugin: Plugin = {
    manifest: {
        name: 'emoji-stash',
        platforms: '*',
        kind: 'channel',
        priority: 3,
        impl: 'local',
    },
    match(message, ctx) {
        if (message.type !== 'text') return false;
        const command = commandText(message, ctx);
        if (command === '表情列表' || parseBan(command).hit) return true;
        return extractEmojiBracketCommand(message.content ?? '') != null;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const command = commandText(message, ctx);
        if (command === '表情列表') {
            const items = await emojiListAll(ctx.env);
            return buildEmojiListCard(
                items,
                resolveBotName(ctx.env),
                Math.max(Date.now(), message.timestamp * 1000),
            );
        }

        const ban = parseBan(command);
        if (ban.hit) {
            const ownerId = resolveOwnerId(ctx.env, message.platform);
            if (!ownerId || message.from.trim() !== ownerId) {
                return textReply('这事只有主人能定');
            }
            const md5 = await resolveQuotedMd5(ctx.env, message) || ban.md5;
            const name = md5 ? undefined : ban.name;
            if (!md5 && !name) return textReply('引用那张，或把名字写后面');
            const result = await emojiBan(ctx.env, {md5, name, imgUrl: quotedImgUrl(message)});
            if (!result) return textReply('没找着这张 🤔');
            return textReply(result.already ? '早就禁了' : `好，禁了，以后不收也不发`);
        }

        const bracket = extractEmojiBracketCommand(message.content ?? '');
        if (!bracket) return null;
        return sendBracket(ctx.env, bracket);
    },
};
