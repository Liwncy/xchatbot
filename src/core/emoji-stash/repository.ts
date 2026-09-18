import {normalizeEmojiStashCategory, type EmojiStashCategory} from './categories.js';
import {EMOJI_STATUSES, type EmojiRecord, type EmojiStatus} from './types.js';

interface EmojiRow {
    id: number;
    name: string;
    description: string | null;
    md5: string | null;
    img_url: string | null;
    mime: string | null;
    category: string | null;
    tags_json: string | null;
    status: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
    source: string | null;
    created_at: number;
    updated_at: number;
}

let schemaReady: Promise<void> | undefined;

export async function ensureEmojiSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.prepare(
                `CREATE TABLE IF NOT EXISTS emoji_stash (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT NOT NULL DEFAULT '',
                    md5 TEXT UNIQUE,
                    img_url TEXT NOT NULL DEFAULT '',
                    mime TEXT,
                    category TEXT NOT NULL DEFAULT 'misc',
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'active',
                    size INTEGER,
                    width INTEGER,
                    height INTEGER,
                    source TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )`,
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_emoji_stash_status_category ON emoji_stash(status, category)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_emoji_stash_created_at ON emoji_stash(created_at DESC)',
            ).run();
            await db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_emoji_stash_updated_at ON emoji_stash(updated_at DESC)',
            ).run();
        })();
    }
    await schemaReady;
}

export function normalizeEmojiStatus(value: string | null | undefined): EmojiStatus {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized || normalized === 'ok') return 'active';
    if ((EMOJI_STATUSES as readonly string[]).includes(normalized)) {
        return normalized as EmojiStatus;
    }
    return 'active';
}

function parseTags(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((tag) => String(tag).trim())
            .filter((tag) => tag.length > 0)
            .slice(0, 12);
    } catch {
        return [];
    }
}

function mapRow(row: EmojiRow): EmojiRecord {
    const name = row.name.trim().toLowerCase();
    return {
        id: row.id,
        name,
        description: (row.description ?? '').trim() || name,
        md5: row.md5?.trim().toLowerCase() || null,
        imgUrl: (row.img_url ?? '').trim(),
        mime: row.mime?.trim() || null,
        category: normalizeEmojiStashCategory(row.category ?? 'misc'),
        tags: parseTags(row.tags_json),
        status: normalizeEmojiStatus(row.status),
        size: typeof row.size === 'number' ? row.size : null,
        width: typeof row.width === 'number' ? row.width : null,
        height: typeof row.height === 'number' ? row.height : null,
        source: row.source?.trim() || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listEmojiNames(db: D1Database): Promise<string[]> {
    await ensureEmojiSchema(db);
    const result = await db.prepare('SELECT name FROM emoji_stash').all<{name: string}>();
    return (result.results ?? []).map((row) => row.name.trim().toLowerCase());
}

export async function getEmojiByMd5(db: D1Database, md5: string): Promise<EmojiRecord | null> {
    await ensureEmojiSchema(db);
    const normalized = md5.trim().toLowerCase();
    if (!normalized) return null;
    const row = await db.prepare('SELECT * FROM emoji_stash WHERE lower(md5) = ? LIMIT 1')
        .bind(normalized)
        .first<EmojiRow>();
    return row ? mapRow(row) : null;
}

export async function getEmojiByName(db: D1Database, name: string): Promise<EmojiRecord | null> {
    await ensureEmojiSchema(db);
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    const row = await db.prepare('SELECT * FROM emoji_stash WHERE name = ? LIMIT 1')
        .bind(normalized)
        .first<EmojiRow>();
    return row ? mapRow(row) : null;
}

export async function getEmojiById(db: D1Database, id: number): Promise<EmojiRecord | null> {
    await ensureEmojiSchema(db);
    const row = await db.prepare('SELECT * FROM emoji_stash WHERE id = ? LIMIT 1')
        .bind(id)
        .first<EmojiRow>();
    return row ? mapRow(row) : null;
}

export interface SearchEmojiOptions {
    query: string;
    category?: string;
    includeInactive?: boolean;
    limit?: number;
}

export async function searchEmojis(
    db: D1Database,
    options: SearchEmojiOptions,
): Promise<{total: number; items: EmojiRecord[]}> {
    await ensureEmojiSchema(db);
    const query = options.query.trim();
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 30);
    const category = options.category ? normalizeEmojiStashCategory(options.category) : null;
    const includeInactive = Boolean(options.includeInactive);

    const where: string[] = [];
    const binds: unknown[] = [];
    if (!includeInactive) where.push("status = 'active'");
    if (category) {
        where.push('category = ?');
        binds.push(category);
    }
    if (query) {
        const like = `%${query.replace(/[%_]/g, '')}%`;
        where.push("(description LIKE ? OR name LIKE ? OR tags_json LIKE ? OR IFNULL(md5,'') LIKE ?)");
        binds.push(like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRow = await db.prepare(`SELECT COUNT(*) AS cnt FROM emoji_stash ${whereSql}`)
        .bind(...binds)
        .first<{cnt: number}>();
    const result = await db.prepare(
        `SELECT * FROM emoji_stash ${whereSql} ORDER BY updated_at DESC, id DESC LIMIT ?`,
    ).bind(...binds, limit).all<EmojiRow>();

    return {
        total: Number(countRow?.cnt ?? 0),
        items: (result.results ?? []).map(mapRow),
    };
}

export interface UpsertEmojiInput {
    name: string;
    description: string;
    md5?: string | null;
    imgUrl?: string;
    mime?: string | null;
    category: EmojiStashCategory;
    tags: string[];
    status: EmojiStatus;
    size?: number | null;
    width?: number | null;
    height?: number | null;
    source?: string | null;
    existingId?: number;
}

export async function upsertEmoji(db: D1Database, input: UpsertEmojiInput): Promise<EmojiRecord> {
    await ensureEmojiSchema(db);
    const now = Date.now();
    const name = input.name.trim().toLowerCase();
    const md5 = input.md5?.trim().toLowerCase() || null;
    const description = input.description.trim();
    const imgUrl = (input.imgUrl ?? '').trim();
    const mime = input.mime?.trim() || null;
    const tagsJson = JSON.stringify(input.tags);
    const source = input.source?.trim() || null;

    let existing: EmojiRecord | null = null;
    if (input.existingId != null) existing = await getEmojiById(db, input.existingId);
    if (!existing && md5) existing = await getEmojiByMd5(db, md5);
    if (!existing && name) existing = await getEmojiByName(db, name);

    if (existing) {
        await db.prepare(
            `UPDATE emoji_stash SET
              name = ?, description = ?, md5 = ?, img_url = ?,
              mime = ?, category = ?, tags_json = ?, status = ?,
              size = ?, width = ?, height = ?, source = ?, updated_at = ?
             WHERE id = ?`,
        ).bind(
            name,
            description,
            md5,
            imgUrl,
            mime ?? existing.mime,
            input.category,
            tagsJson,
            input.status,
            input.size ?? existing.size,
            input.width ?? existing.width,
            input.height ?? existing.height,
            source ?? existing.source,
            now,
            existing.id,
        ).run();
        const updated = await getEmojiById(db, existing.id);
        if (!updated) throw new Error('emoji upsert 后读取失败');
        return updated;
    }

    const result = await db.prepare(
        `INSERT INTO emoji_stash (
            name, description, md5, img_url, mime, category, tags_json,
            status, size, width, height, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        name,
        description,
        md5,
        imgUrl,
        mime,
        input.category,
        tagsJson,
        input.status,
        input.size ?? null,
        input.width ?? null,
        input.height ?? null,
        source,
        now,
        now,
    ).run();

    const id = Number(result.meta.last_row_id);
    const created = await getEmojiById(db, id);
    if (!created) throw new Error('emoji insert 后读取失败');
    return created;
}
