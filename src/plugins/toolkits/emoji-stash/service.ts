import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {EmojiReply, HandlerResponse} from '../../../types/reply.js';
import {resolvePublicImageUrlFromEmojiCdnurl} from '../../cognitive/agnes-text/resolve-image.js';
import {isEmojiStashCategory} from './categories.js';
import {
    buildFallbackEmojiMetadata,
    requestEmojiAiMetadata,
    resolveUniqueEmojiName,
} from './ai-metadata.js';
import {
    EMOJI_STASH_AI_FAIL_REPLY,
    EMOJI_STASH_AUTO_COLLECT,
    EMOJI_STASH_AUTO_OK_REPLY,
    EMOJI_STASH_DELETE_OK_REPLY,
    EMOJI_STASH_NOT_FOUND_REPLY,
    EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY,
    EMOJI_STASH_SAVE_OK_REPLY,
    EMOJI_STASH_SAVE_REPLY,
    EMOJI_STASH_VERIFY_DEFAULT_BATCH,
    EMOJI_STASH_VERIFY_EMPTY_REPLY,
    EMOJI_STASH_VERIFY_MAX_BATCH,
    EMOJI_STASH_VERIFY_START_REPLY,
} from './constants.js';
import {buildEmojiStashListReply} from './list-reply.js';
import type {EmojiBracketSendCommand} from './parse-send.js';
import {parseInboundEmojiFromMessage} from './parser.js';
import {EmojiStashRepository} from './repository.js';
import {
    buildEmojiStashSessionKey,
    deleteEmojiStashPending,
    getEmojiStashPending,
    isEmojiStashAutoCollectOnCooldown,
    markEmojiStashAutoCollectCooldown,
    putEmojiStashPending,
} from './storage.js';
import type {EmojiAiMetadata, ParsedInboundEmoji, StoredEmoji} from './types.js';

function toStoredEmoji(
    metadata: EmojiAiMetadata,
    parsed: ParsedInboundEmoji,
    source: 'auto' | 'manual',
): StoredEmoji {
    return {
        name: metadata.name,
        md5: parsed.md5,
        cdnurl: parsed.cdnurl,
        category: metadata.category,
        tags: metadata.tags,
        ...(parsed.size ? {size: parsed.size} : {}),
        ...(parsed.width ? {width: parsed.width} : {}),
        ...(parsed.height ? {height: parsed.height} : {}),
        createdAt: Date.now(),
        source,
    };
}

async function resolveAiMetadata(
    env: Env,
    parsed: ParsedInboundEmoji,
): Promise<{metadata: EmojiAiMetadata; aiFailed: boolean}> {
    const imageUrl = await resolvePublicImageUrlFromEmojiCdnurl(parsed.cdnurl);
    if (!imageUrl) {
        return {metadata: buildFallbackEmojiMetadata(parsed.md5), aiFailed: true};
    }

    const metadata = await requestEmojiAiMetadata(env, imageUrl);
    if (!metadata) {
        return {metadata: buildFallbackEmojiMetadata(parsed.md5), aiFailed: true};
    }
    return {metadata, aiFailed: false};
}

async function persistEmojiWithAi(
    _message: IncomingMessage,
    env: Env,
    parsed: ParsedInboundEmoji,
    source: 'auto' | 'manual',
): Promise<HandlerResponse | null> {
    const emojis = await EmojiStashRepository.listStoredEmojis(env);
    const existingByMd5 = emojis.find((item) => item.md5 === parsed.md5);

    if (source === 'auto' && existingByMd5) return null;

    const {metadata: aiMeta, aiFailed} = await resolveAiMetadata(env, parsed);
    const existingNames = emojis
        .filter((item) => item.md5 !== parsed.md5)
        .map((item) => item.name);
    const uniqueName = resolveUniqueEmojiName(aiMeta.name, existingNames, parsed.md5);
    const metadata: EmojiAiMetadata = {
        ...aiMeta,
        name: uniqueName,
    };

    const stored = toStoredEmoji(metadata, parsed, source);
    await EmojiStashRepository.upsertStoredEmoji(env, stored);

    if (source === 'auto') {
        if (aiFailed || await isEmojiStashAutoCollectOnCooldown(env)) return null;
        await markEmojiStashAutoCollectCooldown(env);
        return {type: 'text', content: EMOJI_STASH_AUTO_OK_REPLY};
    }

    const prefix = aiFailed ? `${EMOJI_STASH_AI_FAIL_REPLY}\n` : '';
    return {
        type: 'text',
        content: prefix + EMOJI_STASH_SAVE_OK_REPLY(stored.name, stored.category, stored.tags),
    };
}

export async function markEmojiStashPending(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const sessionKey = buildEmojiStashSessionKey(message);
    await putEmojiStashPending(env, {
        ownerId: message.from,
        sessionKey,
        createdAt: Date.now(),
    });
    return {type: 'text', content: EMOJI_STASH_SAVE_REPLY};
}

export async function saveEmojiFromMessage(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    const sessionKey = buildEmojiStashSessionKey(message);
    const pending = await getEmojiStashPending(env, sessionKey);
    if (!pending || pending.ownerId !== message.from) {
        return null;
    }

    await deleteEmojiStashPending(env, sessionKey);

    const parsed = parseInboundEmojiFromMessage(message);
    if (!parsed?.md5 || !parsed.cdnurl) {
        return {type: 'text', content: EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY};
    }

    return persistEmojiWithAi(message, env, parsed, 'manual');
}

export async function saveEmojiFromQuote(
    message: IncomingMessage,
    env: Env,
    parsed: ParsedInboundEmoji,
): Promise<HandlerResponse> {
    if (!parsed.md5 || !parsed.cdnurl) {
        return {type: 'text', content: EMOJI_STASH_SAVE_MISSING_FIELDS_REPLY};
    }
    return persistEmojiWithAi(message, env, parsed, 'manual');
}

export async function autoCollectEmojiFromMessage(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    if (!EMOJI_STASH_AUTO_COLLECT) return null;

    const sessionKey = buildEmojiStashSessionKey(message);
    const pending = await getEmojiStashPending(env, sessionKey);
    if (pending?.ownerId === message.from) return null;

    const parsed = parseInboundEmojiFromMessage(message);
    if (!parsed?.md5 || !parsed.cdnurl) return null;

    return persistEmojiWithAi(message, env, parsed, 'auto');
}

function pickRandom<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(Math.random() * items.length)];
}

function isSendableEmoji(item: StoredEmoji): boolean {
    return item.status !== 'failed';
}

function findStoredEmojiByName(emojis: StoredEmoji[], name: string): StoredEmoji | undefined {
    const normalized = name.trim().toLowerCase();
    return emojis.find((item) => item.name === normalized && isSendableEmoji(item));
}

function findRandomByCategory(emojis: StoredEmoji[], category: string): StoredEmoji | undefined {
    const normalized = category.trim().toLowerCase();
    if (!isEmojiStashCategory(normalized)) return undefined;
    return pickRandom(emojis.filter((item) => item.category === normalized && isSendableEmoji(item)));
}

function findRandomByTag(emojis: StoredEmoji[], tag: string): StoredEmoji | undefined {
    const normalized = tag.trim().toLowerCase();
    return pickRandom(emojis.filter((item) => item.tags.includes(normalized) && isSendableEmoji(item)));
}

function toEmojiSendReply(target: StoredEmoji): EmojiReply {
    return {
        type: 'emoji',
        md5: target.md5,
        emojiUrl: target.cdnurl,
    };
}

export async function sendStoredEmojiByBracket(
    _message: IncomingMessage,
    env: Env,
    command: EmojiBracketSendCommand,
): Promise<HandlerResponse | null> {
    if (!env.WECHAT_API_BASE_URL?.trim()) {
        return null;
    }

    const emojis = await EmojiStashRepository.listStoredEmojis(env);
    let target: StoredEmoji | undefined;

    if (command.type === 'name') {
        target = findStoredEmojiByName(emojis, command.value);
    } else if (command.type === 'category') {
        target = findRandomByCategory(emojis, command.value);
    } else {
        target = findRandomByTag(emojis, command.value);
    }

    if (!target) return null;

    return toEmojiSendReply(target);
}

export async function listEmojiStash(message: IncomingMessage, env: Env): Promise<HandlerResponse> {
    return buildEmojiStashListReply(message, env);
}

function normalizeVerifyBatchSize(count?: number): number {
    if (!Number.isFinite(count) || (count ?? 0) <= 0) {
        return EMOJI_STASH_VERIFY_DEFAULT_BATCH;
    }
    return Math.min(Math.floor(count!), EMOJI_STASH_VERIFY_MAX_BATCH);
}

function buildEmojiVerifyReplies(
    items: StoredEmoji[],
    mode: 'pending' | 'failed',
    count?: number,
): HandlerResponse {
    if (items.length === 0) {
        return {type: 'text', content: EMOJI_STASH_VERIFY_EMPTY_REPLY};
    }

    const batchSize = normalizeVerifyBatchSize(count);
    const selected = items.slice(0, batchSize);
    return [
        {type: 'text', content: EMOJI_STASH_VERIFY_START_REPLY(mode, selected.length, items.length)},
        ...selected.map((item) => toEmojiSendReply(item)),
    ];
}

export async function verifyUnsentEmojis(
    _message: IncomingMessage,
    env: Env,
    count?: number,
): Promise<HandlerResponse> {
    const emojis = await EmojiStashRepository.listStoredEmojis(env);
    const pending = emojis.filter((item) => item.status == null);
    return buildEmojiVerifyReplies(pending, 'pending', count);
}

export async function retryFailedEmojis(
    _message: IncomingMessage,
    env: Env,
    count?: number,
): Promise<HandlerResponse> {
    const emojis = await EmojiStashRepository.listStoredEmojis(env);
    const failed = emojis.filter((item) => item.status === 'failed');
    return buildEmojiVerifyReplies(failed, 'failed', count);
}

export async function deleteStoredEmoji(
    _message: IncomingMessage,
    env: Env,
    name: string,
): Promise<HandlerResponse> {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) {
        return {type: 'text', content: '请指定要删除的表情名称，例如：删表情 no_java_cat'};
    }

    const deleted = await EmojiStashRepository.deleteByName(env, normalizedName);
    if (!deleted) {
        return {type: 'text', content: EMOJI_STASH_NOT_FOUND_REPLY(normalizedName)};
    }
    return {type: 'text', content: EMOJI_STASH_DELETE_OK_REPLY(normalizedName)};
}

export async function hasEmojiStashPending(message: IncomingMessage, env: Env): Promise<boolean> {
    const sessionKey = buildEmojiStashSessionKey(message);
    const pending = await getEmojiStashPending(env, sessionKey);
    return Boolean(pending && pending.ownerId === message.from);
}

export async function markStoredEmojiStatusFailed(env: Env, md5: string): Promise<void> {
    await EmojiStashRepository.updateStatusByMd5(env, md5, 'failed');
}

export async function markStoredEmojiStatusOk(env: Env, md5: string): Promise<void> {
    await EmojiStashRepository.updateStatusByMd5(env, md5, 'ok');
}
