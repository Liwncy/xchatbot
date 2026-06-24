import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import {EMOJI_STASH_SHARED_KV_KEY} from './constants.js';
import {normalizeEmojiStashCategory} from './categories.js';
import type {StoredEmoji, StoredEmojiStatus} from './types.js';

type EmojiStashRow = {
    id: number;
    md5: string;
    name: string;
    cdnurl: string;
    category: string;
    tags_json: string;
    size: number | null;
    width: number | null;
    height: number | null;
    created_at: number;
    source: string | null;
    status: string | null;
};

type LegacyStoredEmoji = StoredEmoji & {sendFailed?: boolean};

const EMOJI_STASH_D1_MIGRATED_KV_KEY = 'emoji-stash:migrated:d1';

let schemaReady: Promise<void> | null = null;

function normalizeStoredEmoji(raw: LegacyStoredEmoji): StoredEmoji {
    const {sendFailed: legacySendFailed, status: rawStatus, ...rest} = raw;
    const status: StoredEmojiStatus | undefined = rawStatus === 'failed' || legacySendFailed
        ? 'failed'
        : rawStatus === 'ok'
            ? 'ok'
            : undefined;

    return {
        ...rest,
        name: String(raw.name ?? '').trim().toLowerCase(),
        md5: String(raw.md5 ?? '').trim(),
        cdnurl: String(raw.cdnurl ?? '').trim(),
        category: normalizeEmojiStashCategory(String(raw.category ?? 'misc')),
        tags: Array.isArray(raw.tags)
            ? raw.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
            : [],
        createdAt: Number(raw.createdAt) || Date.now(),
        ...(typeof raw.size === 'number' && Number.isFinite(raw.size) ? {size: raw.size} : {}),
        ...(typeof raw.width === 'number' && Number.isFinite(raw.width) ? {width: raw.width} : {}),
        ...(typeof raw.height === 'number' && Number.isFinite(raw.height) ? {height: raw.height} : {}),
        ...(raw.source === 'auto' || raw.source === 'manual' ? {source: raw.source} : {}),
        ...(status ? {status} : {}),
    };
}

function mapRow(row: EmojiStashRow): StoredEmoji {
    let tags: string[] = [];
    try {
        const parsed = JSON.parse(row.tags_json) as unknown;
        tags = Array.isArray(parsed)
            ? parsed.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
            : [];
    } catch {
        tags = [];
    }

    const status = row.status === 'failed' || row.status === 'ok'
        ? row.status
        : undefined;

    return {
        name: row.name.trim().toLowerCase(),
        md5: row.md5.trim(),
        cdnurl: row.cdnurl.trim(),
        category: normalizeEmojiStashCategory(row.category),
        tags,
        createdAt: row.created_at,
        ...(typeof row.size === 'number' ? {size: row.size} : {}),
        ...(typeof row.width === 'number' ? {width: row.width} : {}),
        ...(typeof row.height === 'number' ? {height: row.height} : {}),
        ...(row.source === 'auto' || row.source === 'manual' ? {source: row.source} : {}),
        ...(status ? {status} : {}),
    };
}

export class EmojiStashRepository {
    private static readonly CREATE_TABLE_SQL = "CREATE TABLE IF NOT EXISTS emoji_stash ("
        + 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
        + 'md5 TEXT NOT NULL UNIQUE, '
        + 'name TEXT NOT NULL UNIQUE, '
        + 'cdnurl TEXT NOT NULL, '
        + "category TEXT NOT NULL DEFAULT 'misc', "
        + "tags_json TEXT NOT NULL DEFAULT '[]', "
        + 'size INTEGER, '
        + 'width INTEGER, '
        + 'height INTEGER, '
        + 'created_at INTEGER NOT NULL, '
        + 'source TEXT, '
        + 'status TEXT'
        + ')';

    private static readonly CREATE_INDEXES_SQL = [
        'CREATE INDEX IF NOT EXISTS idx_emoji_stash_category ON emoji_stash(category, name)',
        'CREATE INDEX IF NOT EXISTS idx_emoji_stash_status ON emoji_stash(status)',
        'CREATE INDEX IF NOT EXISTS idx_emoji_stash_created_at ON emoji_stash(created_at DESC)',
    ];

    static async ensureSchema(db: D1Database): Promise<void> {
        if (!schemaReady) {
            schemaReady = (async () => {
                await db.prepare(EmojiStashRepository.CREATE_TABLE_SQL).run();
                for (const sql of EmojiStashRepository.CREATE_INDEXES_SQL) {
                    await db.prepare(sql).run();
                }
            })();
        }
        await schemaReady;
    }

    private static async markMigrated(env: Env): Promise<void> {
        await env.XBOT_KV.put(EMOJI_STASH_D1_MIGRATED_KV_KEY, String(Date.now()));
    }

    private static async hasMigrationMarker(env: Env): Promise<boolean> {
        const raw = await env.XBOT_KV.get(EMOJI_STASH_D1_MIGRATED_KV_KEY);
        return Boolean(raw?.trim());
    }

    private static async loadLegacyStoredEmojis(env: Env): Promise<StoredEmoji[]> {
        const raw = await env.XBOT_KV.get(EMOJI_STASH_SHARED_KV_KEY);
        if (!raw?.trim()) return [];
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((item): item is LegacyStoredEmoji => Boolean(item && typeof item === 'object'))
                .map((item) => normalizeStoredEmoji(item))
                .filter((item) => Boolean(item.md5 && item.name && item.cdnurl));
        } catch {
            return [];
        }
    }

    private static async countStoredEmojis(db: D1Database): Promise<number> {
        const row = await db.prepare('SELECT COUNT(1) AS total FROM emoji_stash').first<{total?: number}>();
        return Number(row?.total ?? 0) || 0;
    }

    private static upsertStatement(db: D1Database, emoji: StoredEmoji) {
        return db.prepare(
            `INSERT INTO emoji_stash (
                md5, name, cdnurl, category, tags_json,
                size, width, height, created_at, source, status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(md5) DO UPDATE SET
                name = excluded.name,
                cdnurl = excluded.cdnurl,
                category = excluded.category,
                tags_json = excluded.tags_json,
                size = excluded.size,
                width = excluded.width,
                height = excluded.height,
                created_at = excluded.created_at,
                source = excluded.source,
                status = excluded.status`,
        ).bind(
            emoji.md5.trim(),
            emoji.name.trim().toLowerCase(),
            emoji.cdnurl.trim(),
            normalizeEmojiStashCategory(emoji.category),
            JSON.stringify(emoji.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
            emoji.size ?? null,
            emoji.width ?? null,
            emoji.height ?? null,
            emoji.createdAt,
            emoji.source ?? null,
            emoji.status ?? null,
        );
    }

    static async migrateLegacyKvIfNeeded(env: Env): Promise<void> {
        await EmojiStashRepository.ensureSchema(env.XBOT_DB);
        if (await EmojiStashRepository.hasMigrationMarker(env)) {
            return;
        }

        const rowCount = await EmojiStashRepository.countStoredEmojis(env.XBOT_DB);
        if (rowCount > 0) {
            await EmojiStashRepository.markMigrated(env);
            return;
        }

        const legacyEmojis = await EmojiStashRepository.loadLegacyStoredEmojis(env);
        if (legacyEmojis.length === 0) {
            await EmojiStashRepository.markMigrated(env);
            return;
        }

        const statements = legacyEmojis.map((emoji) =>
            EmojiStashRepository.upsertStatement(env.XBOT_DB, emoji),
        );
        await env.XBOT_DB.batch(statements);
        await EmojiStashRepository.markMigrated(env);
        logger.info('emoji-stash 已从 KV 迁移到 D1', {count: legacyEmojis.length});
    }

    static async ensureReady(env: Env): Promise<void> {
        await EmojiStashRepository.ensureSchema(env.XBOT_DB);
        await EmojiStashRepository.migrateLegacyKvIfNeeded(env);
    }

    static async listStoredEmojis(env: Env): Promise<StoredEmoji[]> {
        await EmojiStashRepository.ensureReady(env);
        const result = await env.XBOT_DB.prepare(
            `SELECT *
             FROM emoji_stash
             ORDER BY created_at ASC, id ASC`,
        ).all<EmojiStashRow>();
        return (result.results ?? []).map(mapRow);
    }

    static async upsertStoredEmoji(env: Env, emoji: StoredEmoji): Promise<void> {
        await EmojiStashRepository.ensureReady(env);
        await EmojiStashRepository.upsertStatement(env.XBOT_DB, normalizeStoredEmoji(emoji)).run();
    }

    static async deleteByName(env: Env, name: string): Promise<boolean> {
        await EmojiStashRepository.ensureReady(env);
        const normalizedName = name.trim().toLowerCase();
        if (!normalizedName) return false;
        const result = await env.XBOT_DB.prepare(
            'DELETE FROM emoji_stash WHERE name = ?1',
        ).bind(normalizedName).run();
        return Number(result.meta.changes ?? 0) > 0;
    }

    static async updateStatusByMd5(
        env: Env,
        md5: string,
        status: StoredEmojiStatus,
    ): Promise<void> {
        await EmojiStashRepository.ensureReady(env);
        const normalizedMd5 = md5.trim();
        if (!normalizedMd5) return;

        const row = await env.XBOT_DB.prepare(
            'SELECT status FROM emoji_stash WHERE md5 = ?1 LIMIT 1',
        ).bind(normalizedMd5).first<{status?: string | null}>();
        const currentStatus = row?.status === 'failed' || row?.status === 'ok'
            ? row.status
            : undefined;
        if (status === 'failed' && currentStatus === 'ok') return;
        if (status === 'failed' && currentStatus === 'failed') return;
        if (status === 'ok' && currentStatus === 'ok') return;

        await env.XBOT_DB.prepare(
            'UPDATE emoji_stash SET status = ?2 WHERE md5 = ?1',
        ).bind(normalizedMd5, status).run();
    }
}
