import type {Env} from '../../types/env.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {normalizeEmojiStashCategory} from './categories.js';
import {
    fallbackEmojiName,
    fallbackEmojiTags,
    normalizeTags,
    resolveUniqueEmojiName,
} from './names.js';
import {describeEmoji} from './tag-zh.js';
import {
    getEmojiById,
    getEmojiByMd5,
    getEmojiByName,
    insertEmojiIfNew,
    listEmojiNames,
    normalizeEmojiStatus,
    searchEmojis,
    upsertEmoji,
} from './repository.js';
import {labelEmojiFromImage} from './label.js';
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
    const labeled = seeUrl ? await labelEmojiFromImage(env, seeUrl) : null;
    return insertEmojiIfNew(env.XBOT_DB, {
        name: `e${md5}`,
        description: labeled?.description || '收到的表情',
        md5,
        imgUrl: storeUrl,
        category: labeled?.category ?? 'misc',
        tags: labeled?.tags.length ? labeled.tags : ['表情'],
        source: options.source?.trim() || 'inbound',
    });
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
        status: options.status ? normalizeEmojiStatus(options.status) : (existing?.status ?? 'active'),
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
