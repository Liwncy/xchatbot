import type {Env} from '../../types/env.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {normalizeEmojiStashCategory, resolveEmojiStashCategoryToken} from './categories.js';
import {
    fallbackEmojiName,
    fallbackEmojiTags,
    isPlaceholderEmojiName,
    nameFromEmojiLabel,
    normalizeTags,
    resolveUniqueEmojiName,
} from './names.js';
import {describeEmoji} from './tag-zh.js';
import {
    countPlaceholderEmojis,
    getEmojiById,
    getEmojiByMd5,
    getEmojiByName,
    insertEmojiIfNew,
    listEmojiNames,
    listEmojis,
    listPlaceholderEmojis,
    normalizeEmojiStatus,
    pickRandomEmoji,
    searchEmojis,
    upsertEmoji,
} from './repository.js';
import {inspectEmojiFromImage} from './label.js';
import type {EmojiPublicItem, EmojiRecord} from './types.js';
import {pickDurableImageUrl} from './urls.js';

function requireDb(env: Env): D1Database {
    if (!env.XBOT_DB) throw new Error('XBOT_DB 未绑定');
    return env.XBOT_DB;
}

function toPublic(item: EmojiRecord): EmojiPublicItem {
    return {
        id: item.id,
        name: item.name,
        description: item.description,
        md5: item.md5,
        imgUrl: pickDurableImageUrl(item.imgUrl),
        mime: item.mime,
        category: item.category,
        tags: item.tags,
        status: item.status,
    };
}

function normalizeMd5(value: string | undefined): string | null {
    const trimmed = value?.trim().toLowerCase() ?? '';
    if (!trimmed) return null;
    if (!/^[0-9a-f]{32}$/.test(trimmed)) throw new Error('md5 须为 32 位十六进制');
    return trimmed;
}

async function tryRehost(
    imgUrl: string,
): Promise<{imgUrl: string; mime: string | null}> {
    const source = imgUrl.trim();
    if (!source) return {imgUrl: '', mime: null};
    try {
        const response = await fetch(source);
        if (!response.ok) return {imgUrl: '', mime: null};
        const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
        const uploaded = await FileUploader.upload(await response.arrayBuffer(), {
            fileName: 'emoji',
            contentType: mime,
        });
        return {imgUrl: pickDurableImageUrl(uploaded), mime};
    } catch {
        return {imgUrl: '', mime: null};
    }
}

export async function emojiSearch(
    env: Env,
    options: {query: string; category?: string; includeInactive?: boolean; limit?: number},
): Promise<{total: number; items: EmojiPublicItem[]}> {
    const result = await searchEmojis(requireDb(env), options);
    return {total: result.total, items: result.items.map(toPublic)};
}

export async function emojiGet(
    env: Env,
    options: {md5?: string; name?: string},
): Promise<EmojiPublicItem | null> {
    const db = requireDb(env);
    const md5 = options.md5?.trim();
    const name = options.name?.trim();
    if (!md5 && !name) throw new Error('请提供 md5 或 name');
    const row = md5 ? await getEmojiByMd5(db, md5) : await getEmojiByName(db, name ?? '');
    return row ? toPublic(row) : null;
}

export async function emojiCollectInbound(
    env: Env,
    options: {md5?: string; imgUrl?: string; source?: string},
): Promise<boolean> {
    if (!env.XBOT_DB) return false;
    let md5: string;
    try {
        const normalized = normalizeMd5(options.md5);
        if (!normalized) return false;
        md5 = normalized;
    } catch {
        return false;
    }
    if (await getEmojiByMd5(env.XBOT_DB, md5)) return false;

    const storeUrl = pickDurableImageUrl(options.imgUrl);
    const seeUrl = storeUrl || options.imgUrl?.trim() || '';
    const inspected = seeUrl ? await inspectEmojiFromImage(env, seeUrl) : {labeled: null, meta: null};
    const labeled = inspected.labeled;
    const existingNames = await listEmojiNames(env.XBOT_DB);
    return insertEmojiIfNew(env.XBOT_DB, {
        name: nameFromEmojiLabel(labeled, existingNames, md5),
        description: labeled?.description || '收到的表情',
        md5,
        imgUrl: storeUrl,
        category: labeled?.category ?? 'misc',
        tags: labeled?.tags.length ? labeled.tags : ['表情'],
        source: options.source?.trim() || 'inbound',
        mime: inspected.meta?.mime ?? labeled?.mime,
        size: inspected.meta?.size ?? labeled?.size,
        width: inspected.meta?.width ?? labeled?.width,
        height: inspected.meta?.height ?? labeled?.height,
    });
}

const GENERIC_EMOJI_DESC = /^(收到的表情|表情)$/u;
const HAS_CJK = /[\u4e00-\u9fff]/u;

function labelFromExisting(row: EmojiRecord): {name?: string; description?: string; tags: string[]; category?: EmojiRecord['category']} | null {
    const description = row.description.trim();
    const tags = row.tags.filter((tag) => HAS_CJK.test(tag) && tag !== '表情');
    const descOk = HAS_CJK.test(description) && !GENERIC_EMOJI_DESC.test(description);
    if (!descOk && !tags.length) return null;
    return {
        name: descOk ? description.slice(0, 8) : tags.slice(0, 2).join(''),
        description: descOk ? description : undefined,
        tags: tags.length ? tags : row.tags,
        category: row.category,
    };
}

function descriptionNeedsRefresh(description: string): boolean {
    const text = description.trim();
    if (!text || GENERIC_EMOJI_DESC.test(text) || !HAS_CJK.test(text)) return true;
    return [...text].length < 16;
}

export async function emojiRelabelPlaceholders(
    env: Env,
    options?: {limit?: number; llmLimit?: number},
): Promise<{updated: number; skipped: number; remaining: number; names: string[]; message: string}> {
    if (!env.XBOT_DB) {
        return {updated: 0, skipped: 0, remaining: 0, names: [], message: '库还没接上'};
    }
    const db = env.XBOT_DB;
    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 40);
    let llmBudget = Math.min(Math.max(options?.llmLimit ?? 2, 0), 8);
    const candidates = await listPlaceholderEmojis(db, Math.min(limit + 8, 50));
    const existingNames = await listEmojiNames(db);
    let updated = 0;
    let skipped = 0;
    const names: string[] = [];

    for (const row of candidates) {
        if (updated >= limit) break;
        if (!isPlaceholderEmojiName(row.name)) {
            skipped += 1;
            continue;
        }
        let labeled = labelFromExisting(row);
        let meta = {mime: row.mime, size: row.size, width: row.width, height: row.height};
        const seeUrl = pickDurableImageUrl(row.imgUrl);
        if (llmBudget > 0 && seeUrl && (!labeled || descriptionNeedsRefresh(row.description))) {
            const seen = await inspectEmojiFromImage(env, seeUrl);
            if (seen.labeled) labeled = seen.labeled;
            if (seen.meta) meta = seen.meta;
            llmBudget -= 1;
        }
        if (!labeled) {
            skipped += 1;
            continue;
        }
        const nextName = nameFromEmojiLabel(
            labeled,
            existingNames.filter((name) => name !== row.name),
            row.md5 ?? String(row.id),
        );
        await upsertEmoji(db, {
            existingId: row.id,
            name: nextName,
            description: labeled.description?.trim() || row.description,
            md5: row.md5,
            imgUrl: row.imgUrl,
            mime: meta.mime,
            category: labeled.category ?? row.category,
            tags: labeled.tags.length ? labeled.tags : row.tags,
            status: row.status,
            size: meta.size,
            width: meta.width,
            height: meta.height,
            source: row.source,
        });
        existingNames.push(nextName);
        names.push(nextName);
        updated += 1;
    }

    const remaining = await countPlaceholderEmojis(db);
    let message = '没有要重标的';
    if (updated) {
        const shown = names.slice(0, 8).join('、');
        const extra = remaining ? `，还剩 ${remaining} 个` : '';
        message = shown ? `好，标了 ${updated} 个：${shown}${extra}` : `好，标了 ${updated} 个${extra}`;
    } else if (remaining) {
        message = skipped ? `这批没标上，还剩 ${remaining} 个` : `还剩 ${remaining} 个`;
    }
    return {updated, skipped, remaining, names, message};
}

export async function emojiSave(
    env: Env,
    options: {
        md5?: string;
        imgUrl?: string;
        name?: string;
        description?: string;
        tags?: string[];
        category?: string;
        status?: string;
        mime?: string;
        source?: string;
        width?: number;
        height?: number;
        size?: number;
    },
): Promise<EmojiPublicItem> {
    const db = requireDb(env);
    const md5 = normalizeMd5(options.md5);
    const inputImgUrl = options.imgUrl?.trim() ?? '';
    if (!md5 && !inputImgUrl) throw new Error('至少提供 md5 或 imgUrl 之一');

    const seed = md5 ?? inputImgUrl;
    const existing = md5
        ? await getEmojiByMd5(db, md5)
        : options.name?.trim()
            ? await getEmojiByName(db, options.name)
            : null;

    const existingNames = await listEmojiNames(db);
    const namesForUnique = existing ? existingNames.filter((name) => name !== existing.name) : existingNames;
    const desiredName = options.name?.trim() || existing?.name || fallbackEmojiName(seed);
    const name = resolveUniqueEmojiName(desiredName, namesForUnique, seed);
    const category = normalizeEmojiStashCategory(options.category ?? existing?.category ?? 'misc');
    const fromOptions = normalizeTags(options.tags);
    const tags = fromOptions.length
        ? fromOptions
        : existing?.tags.length
            ? existing.tags
            : fallbackEmojiTags(category);
    const rehosted = inputImgUrl ? await tryRehost(inputImgUrl) : {imgUrl: '', mime: null};

    const record = await upsertEmoji(db, {
        existingId: existing?.id,
        name,
        description: options.description?.trim()
            || (existing?.description && /[\u4e00-\u9fff]/u.test(existing.description)
                ? existing.description
                : describeEmoji(name, tags, category)),
        md5: md5 ?? existing?.md5 ?? null,
        imgUrl: pickDurableImageUrl(rehosted.imgUrl, inputImgUrl, existing?.imgUrl),
        mime: options.mime?.trim() || rehosted.mime || existing?.mime || null,
        category,
        tags,
        status: options.status
            ? normalizeEmojiStatus(options.status)
            : existing?.status === 'disabled'
                ? 'disabled'
                : (existing?.status ?? 'active'),
        size: options.size ?? existing?.size ?? null,
        width: options.width ?? existing?.width ?? null,
        height: options.height ?? existing?.height ?? null,
        source: options.source?.trim() || existing?.source || 'agent',
    });
    return toPublic(record);
}

export async function emojiUpdate(
    env: Env,
    options: {
        md5?: string;
        name?: string;
        id?: number;
        newName?: string;
        description?: string;
        tags?: string[];
        category?: string;
        status?: string;
        mime?: string;
        imgUrl?: string;
        md5Value?: string;
    },
): Promise<EmojiPublicItem> {
    const db = requireDb(env);
    const locatorMd5 = options.md5?.trim();
    const locatorName = options.name?.trim();
    const locatorId = options.id;
    if (!locatorMd5 && !locatorName && locatorId == null) {
        throw new Error('请用 md5、name 或 id 指定要改的条目');
    }

    let existing = locatorId != null ? await getEmojiById(db, locatorId) : null;
    if (!existing && locatorMd5) existing = await getEmojiByMd5(db, locatorMd5);
    if (!existing && locatorName) existing = await getEmojiByName(db, locatorName);
    if (!existing) throw new Error('未找到要修改的条目');

    const patchKeys = [
        options.newName,
        options.description,
        options.tags,
        options.category,
        options.status,
        options.mime,
        options.imgUrl,
        options.md5Value,
    ];
    if (patchKeys.every((value) => value === undefined)) {
        throw new Error('请至少提供一个要改的字段');
    }

    let nextName = existing.name;
    if (options.newName?.trim()) {
        const existingNames = await listEmojiNames(db);
        nextName = resolveUniqueEmojiName(
            options.newName,
            existingNames.filter((name) => name !== existing.name),
            existing.md5 ?? String(existing.id),
        );
    }

    let nextImgUrl = pickDurableImageUrl(existing.imgUrl);
    let nextMime = existing.mime;
    if (options.imgUrl?.trim()) {
        const source = options.imgUrl.trim();
        const rehosted = await tryRehost(source);
        nextImgUrl = pickDurableImageUrl(rehosted.imgUrl, source, existing.imgUrl);
        nextMime = options.mime?.trim() || rehosted.mime || existing.mime;
    } else if (options.mime?.trim()) {
        nextMime = options.mime.trim();
    }

    let nextMd5 = existing.md5;
    if (options.md5Value !== undefined) {
        nextMd5 = options.md5Value.trim() ? normalizeMd5(options.md5Value) : null;
    }

    const record = await upsertEmoji(db, {
        existingId: existing.id,
        name: nextName,
        description: options.description !== undefined
            ? options.description.trim()
            : options.tags !== undefined
                ? describeEmoji(nextName, options.tags !== undefined ? normalizeTags(options.tags) : existing.tags, options.category !== undefined ? options.category : existing.category)
                : existing.description,
        md5: nextMd5,
        imgUrl: nextImgUrl,
        mime: nextMime,
        category: options.category !== undefined
            ? normalizeEmojiStashCategory(options.category)
            : existing.category,
        tags: options.tags !== undefined ? normalizeTags(options.tags) : existing.tags,
        status: options.status !== undefined ? normalizeEmojiStatus(options.status) : existing.status,
        size: existing.size,
        width: existing.width,
        height: existing.height,
        source: existing.source,
    });
    return toPublic(record);
}

export type EmojiPickResult =
    | {ok: true; item: EmojiPublicItem}
    | {ok: false; reason: 'missing' | 'banned' | 'bad-category'};

export async function emojiPickByName(env: Env, name: string): Promise<EmojiPickResult> {
    const row = await getEmojiByName(requireDb(env), name);
    if (!row) return {ok: false, reason: 'missing'};
    if (row.status === 'disabled' || !row.md5) {
        return {ok: false, reason: row.status === 'disabled' ? 'banned' : 'missing'};
    }
    return {ok: true, item: toPublic(row)};
}

export async function emojiPickRandom(
    env: Env,
    options?: {category?: string; tag?: string},
): Promise<EmojiPickResult> {
    let category: string | undefined;
    if (options?.category) {
        const resolved = resolveEmojiStashCategoryToken(options.category);
        if (!resolved) return {ok: false, reason: 'bad-category'};
        category = resolved;
    }
    const row = await pickRandomEmoji(requireDb(env), {
        category,
        tag: options?.tag?.trim(),
    });
    if (!row?.md5) return {ok: false, reason: 'missing'};
    return {ok: true, item: toPublic(row)};
}

export async function emojiListAll(env: Env): Promise<EmojiRecord[]> {
    return listEmojis(requireDb(env), {includeDisabled: true});
}

export async function emojiBan(
    env: Env,
    options: {md5?: string; name?: string; imgUrl?: string},
): Promise<{name: string; already: boolean} | null> {
    const db = requireDb(env);
    let md5: string | null = null;
    try {
        md5 = options.md5 ? normalizeMd5(options.md5) : null;
    } catch {
        md5 = null;
    }
    const name = options.name?.trim();
    let existing = md5 ? await getEmojiByMd5(db, md5) : null;
    if (!existing && name) existing = await getEmojiByName(db, name);
    if (!existing) return null;
    if (existing.status === 'disabled') return {name: existing.name, already: true};
    await upsertEmoji(db, {
        existingId: existing.id,
        name: existing.name,
        description: existing.description,
        md5: existing.md5 ?? md5,
        imgUrl: pickDurableImageUrl(options.imgUrl, existing.imgUrl),
        mime: existing.mime,
        category: existing.category,
        tags: existing.tags,
        status: 'disabled',
        size: existing.size,
        width: existing.width,
        height: existing.height,
        source: existing.source,
    });
    return {name: existing.name, already: false};
}
