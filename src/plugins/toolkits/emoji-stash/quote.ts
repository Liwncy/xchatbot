import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {parseWechatEmojiFromContent} from '../../../wechat/inbound/parse-emoji.js';
import {parseInboundEmojiFromMessage} from './parser.js';
import {saveEmojiFromQuote} from './service.js';
import type {ParsedInboundEmoji} from './types.js';

const QUOTE_SAVE_PATTERN = /^存表情(?:\s+.*)?$/u;

function resolveQuotedEmoji(message: IncomingMessage): ParsedInboundEmoji | null {
    const emojiMeta = message.quote?.emojiMeta;
    if (emojiMeta?.md5 && emojiMeta.cdnurl) {
        return {
            md5: emojiMeta.md5,
            cdnurl: emojiMeta.cdnurl,
            ...(emojiMeta.size ? {size: emojiMeta.size} : {}),
            ...(emojiMeta.width ? {width: emojiMeta.width} : {}),
            ...(emojiMeta.height ? {height: emojiMeta.height} : {}),
        };
    }

    const referContent = message.quote?.referContent?.trim();
    if (!referContent) return null;

    const parsed = parseWechatEmojiFromContent(referContent);
    return parsed
        ? {
            md5: parsed.md5,
            cdnurl: parsed.cdnurl,
            ...(parsed.size ? {size: parsed.size} : {}),
            ...(parsed.width ? {width: parsed.width} : {}),
            ...(parsed.height ? {height: parsed.height} : {}),
        }
        : null;
}

/** 引用表情 +「存表情」→ AI 命名并保存。 */
export async function handleEmojiStashQuote(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    const quote = message.quote;
    if (!quote || quote.referType !== 47) return null;

    const title = quote.title.trim();
    if (!QUOTE_SAVE_PATTERN.test(title)) return null;

    const parsed = resolveQuotedEmoji(message) ?? parseInboundEmojiFromMessage(message);
    if (!parsed) return null;

    return saveEmojiFromQuote(message, env, parsed);
}
