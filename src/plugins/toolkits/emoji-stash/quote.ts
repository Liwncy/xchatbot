import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {parseWechatEmojiFromContent} from '../../../wechat/inbound/parse-emoji.js';
import {
    EMOJI_STASH_QUOTE_NEED_EMOJI_REPLY,
    EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY,
} from './constants.js';
import {parseInboundEmojiFromMessage} from './parser.js';
import {saveEmojiFromQuote} from './service.js';
import type {ParsedInboundEmoji} from './types.js';

const QUOTE_SAVE_PATTERN = /^存表情(?:\s+.*)?$/u;

function resolveQuotedEmoji(message: IncomingMessage): ParsedInboundEmoji | null {
    const emojiMeta = message.quote?.emojiMeta;
    const metaMd5 = emojiMeta?.md5?.trim() ?? '';
    if (metaMd5) {
        const cdnurl = emojiMeta?.cdnurl?.trim() ?? '';
        return {
            md5: metaMd5,
            ...(cdnurl ? {cdnurl} : {}),
            ...(emojiMeta?.size ? {size: emojiMeta.size} : {}),
            ...(emojiMeta?.width ? {width: emojiMeta.width} : {}),
            ...(emojiMeta?.height ? {height: emojiMeta.height} : {}),
        };
    }

    const referContent = message.quote?.referContent?.trim();
    if (!referContent) return null;

    const parsed = parseWechatEmojiFromContent(referContent);
    const md5 = parsed?.md5?.trim() ?? '';
    if (!md5) return null;

    const cdnurl = parsed?.cdnurl?.trim() ?? '';
    return {
        md5,
        ...(cdnurl ? {cdnurl} : {}),
        ...(parsed?.size ? {size: parsed.size} : {}),
        ...(parsed?.width ? {width: parsed.width} : {}),
        ...(parsed?.height ? {height: parsed.height} : {}),
    };
}

/** 引用表情 +「存表情」→ AI 命名并保存。 */
export async function handleEmojiStashQuote(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    const quote = message.quote;
    if (!quote) return null;

    const title = quote.title.trim();
    if (!QUOTE_SAVE_PATTERN.test(title)) return null;

    if (quote.referType !== 47) {
        return {type: 'text', content: EMOJI_STASH_QUOTE_NEED_EMOJI_REPLY};
    }

    const parsed = resolveQuotedEmoji(message) ?? parseInboundEmojiFromMessage(message);
    if (!parsed?.md5) {
        return {type: 'text', content: EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY};
    }

    return saveEmojiFromQuote(message, env, parsed);
}
