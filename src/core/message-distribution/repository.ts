import type {Env} from '../../types/env.js';
import type {MessageType} from '../message.js';
import {
    DEFAULT_CONTENT_POLICY,
    type DistributionContentMode,
    type DistributionContentPolicy,
    type DistributionFallback,
    type DistributionOutput,
    type DistributionRule,
    type DistributionRuleInput,
    type DistributionSource,
    type DistributionStatus,
    type DistributionTarget,
} from './types.js';

interface RuleRow {
    id: string;
    name: string;
    status: string;
    priority: number;
    source_json: string;
    message_types_json: string;
    keywords_json: string;
    pattern: string | null;
    targets_json: string;
    content_policy_json: string;
    continue_pipeline: number;
    created_at: number;
    updated_at: number;
}

let schemaReady: Promise<void> | undefined;

function requireDb(env: Env): D1Database {
    if (!env.XBOT_DB) throw new Error('XBOT_DB 未绑定');
    return env.XBOT_DB;
}

export async function ensureDistributionSchema(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = db.batch([
            db.prepare(
                `CREATE TABLE IF NOT EXISTS message_distribution_rule (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    status TEXT NOT NULL DEFAULT 'active',
                    priority INTEGER NOT NULL DEFAULT 100,
                    source_json TEXT NOT NULL,
                    message_types_json TEXT NOT NULL DEFAULT '[]',
                    keywords_json TEXT NOT NULL DEFAULT '[]',
                    pattern TEXT,
                    targets_json TEXT NOT NULL,
                    content_policy_json TEXT NOT NULL,
                    continue_pipeline INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )`,
            ),
            db.prepare(
                `CREATE TABLE IF NOT EXISTS message_distribution_delivery (
                    delivery_key TEXT PRIMARY KEY,
                    rule_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    target TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )`,
            ),
            db.prepare(
                'CREATE INDEX IF NOT EXISTS idx_distribution_rule_status_priority '
                + 'ON message_distribution_rule(status, priority)',
            ),
        ]).then(() => undefined);
    }
    await schemaReady;
}

function json<T>(raw: string, fallback: T): T {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function asStatus(value: string): DistributionStatus {
    return value === 'disabled' ? 'disabled' : 'active';
}

function asMode(value: unknown): DistributionContentMode {
    return value === 'original' || value === 'rebuild' || value === 'ai' ? value : 'auto';
}

function asOutput(value: unknown): DistributionOutput {
    return value === 'text' || value === 'link' || value === 'media' ? value : 'auto';
}

function asFallback(value: unknown): DistributionFallback {
    return value === 'text' || value === 'skip' ? value : 'rebuild';
}

function normalizePolicy(input?: Partial<DistributionContentPolicy>): DistributionContentPolicy {
    return {
        ...DEFAULT_CONTENT_POLICY,
        ...input,
        mode: asMode(input?.mode),
        output: asOutput(input?.output),
        fallback: asFallback(input?.fallback),
        instruction: input?.instruction?.trim() || undefined,
        prefix: input?.prefix?.trim() || undefined,
        suffix: input?.suffix?.trim() || undefined,
        maxInputChars: Math.min(50_000, Math.max(200, input?.maxInputChars ?? DEFAULT_CONTENT_POLICY.maxInputChars)),
        maxOutputChars: Math.min(4_000, Math.max(50, input?.maxOutputChars ?? DEFAULT_CONTENT_POLICY.maxOutputChars)),
        timeoutMs: Math.min(60_000, Math.max(1_000, input?.timeoutMs ?? DEFAULT_CONTENT_POLICY.timeoutMs)),
    };
}

function normalizeSource(source?: Partial<DistributionSource>): DistributionSource {
    const kind = source?.kind === 'group' || source?.kind === 'private' || source?.kind === 'official'
        ? source.kind
        : 'any';
    const ids = [...new Set((source?.ids ?? []).map((item) => item.trim()).filter(Boolean))];
    return {kind, ids};
}

function normalizeTargets(targets: DistributionTarget[]): DistributionTarget[] {
    const unique = new Map<string, DistributionTarget>();
    for (const target of targets) {
        const platform = target.platform.trim();
        const id = target.id.trim();
        if (!platform || !id) continue;
        const kind = target.kind === 'group' ? 'group' : 'user';
        unique.set(`${platform}:${kind}:${id}`, {platform, kind, id});
    }
    const result = [...unique.values()];
    if (result.length === 0) throw new Error('至少配一个目标');
    if (result.length > 20) throw new Error('一条规则最多 20 个目标');
    return result;
}

function mapRow(row: RuleRow): DistributionRule {
    return {
        id: row.id,
        name: row.name,
        status: asStatus(row.status),
        priority: row.priority,
        source: normalizeSource(json<DistributionSource>(row.source_json, {kind: 'any', ids: []})),
        messageTypes: json<MessageType[]>(row.message_types_json, []),
        keywords: json<string[]>(row.keywords_json, []),
        pattern: row.pattern?.trim() || undefined,
        targets: normalizeTargets(json<DistributionTarget[]>(row.targets_json, [])),
        contentPolicy: normalizePolicy(json<Partial<DistributionContentPolicy>>(row.content_policy_json, {})),
        continuePipeline: row.continue_pipeline === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const COLUMNS = [
    'id', 'name', 'status', 'priority', 'source_json', 'message_types_json',
    'keywords_json', 'pattern', 'targets_json', 'content_policy_json',
    'continue_pipeline', 'created_at', 'updated_at',
].join(', ');

export async function listDistributionRules(env: Env, activeOnly = false): Promise<DistributionRule[]> {
    const db = requireDb(env);
    await ensureDistributionSchema(db);
    const where = activeOnly ? " WHERE status = 'active'" : '';
    const result = await db.prepare(
        `SELECT ${COLUMNS} FROM message_distribution_rule${where} ORDER BY priority ASC, name ASC`,
    ).all<RuleRow>();
    return (result.results ?? []).map(mapRow);
}

export async function getDistributionRule(env: Env, nameOrId: string): Promise<DistributionRule | null> {
    const db = requireDb(env);
    await ensureDistributionSchema(db);
    const key = nameOrId.trim();
    const row = await db.prepare(
        `SELECT ${COLUMNS} FROM message_distribution_rule WHERE id = ? OR name = ? COLLATE NOCASE LIMIT 1`,
    ).bind(key, key).first<RuleRow>();
    return row ? mapRow(row) : null;
}

export async function saveDistributionRule(env: Env, input: DistributionRuleInput): Promise<DistributionRule> {
    const db = requireDb(env);
    await ensureDistributionSchema(db);
    const name = input.name.trim();
    if (!name) throw new Error('名称不能为空');
    const existing = await getDistributionRule(env, name);
    const pattern = input.pattern?.trim() || undefined;
    if (pattern) {
        try {
            new RegExp(pattern, 'iu');
        } catch {
            throw new Error('正则写错了');
        }
    }
    const now = Date.now();
    const id = existing?.id ?? crypto.randomUUID();
    const source = normalizeSource(input.source);
    const targets = normalizeTargets(input.targets);
    const policy = normalizePolicy(input.contentPolicy);
    const messageTypes = [...new Set(input.messageTypes ?? [])];
    const keywords = [...new Set((input.keywords ?? []).map((item) => item.trim()).filter(Boolean))];
    await db.prepare(
        `INSERT INTO message_distribution_rule (
            id, name, status, priority, source_json, message_types_json, keywords_json,
            pattern, targets_json, content_policy_json, continue_pipeline, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            status = excluded.status,
            priority = excluded.priority,
            source_json = excluded.source_json,
            message_types_json = excluded.message_types_json,
            keywords_json = excluded.keywords_json,
            pattern = excluded.pattern,
            targets_json = excluded.targets_json,
            content_policy_json = excluded.content_policy_json,
            continue_pipeline = excluded.continue_pipeline,
            updated_at = excluded.updated_at`,
    ).bind(
        id,
        name,
        input.status ?? existing?.status ?? 'active',
        input.priority ?? existing?.priority ?? 100,
        JSON.stringify(source),
        JSON.stringify(messageTypes),
        JSON.stringify(keywords),
        pattern ?? null,
        JSON.stringify(targets),
        JSON.stringify(policy),
        (input.continuePipeline ?? existing?.continuePipeline ?? true) ? 1 : 0,
        existing?.createdAt ?? now,
        now,
    ).run();
    const saved = await getDistributionRule(env, id);
    if (!saved) throw new Error('规则没记下');
    return saved;
}

export async function setDistributionRuleStatus(
    env: Env,
    nameOrId: string,
    status: DistributionStatus,
): Promise<DistributionRule | null> {
    const existing = await getDistributionRule(env, nameOrId);
    if (!existing) return null;
    const db = requireDb(env);
    await db.prepare(
        'UPDATE message_distribution_rule SET status = ?, updated_at = ? WHERE id = ?',
    ).bind(status, Date.now(), existing.id).run();
    return getDistributionRule(env, existing.id);
}

export async function deleteDistributionRule(env: Env, nameOrId: string): Promise<boolean> {
    const existing = await getDistributionRule(env, nameOrId);
    if (!existing) return false;
    const db = requireDb(env);
    await db.prepare('DELETE FROM message_distribution_rule WHERE id = ?').bind(existing.id).run();
    return true;
}

export async function claimDistributionDelivery(
    env: Env,
    ruleId: string,
    platform: string,
    messageId: string,
    target: DistributionTarget,
): Promise<boolean> {
    const db = requireDb(env);
    await ensureDistributionSchema(db);
    const targetKey = `${target.platform}:${target.kind}:${target.id}`;
    const deliveryKey = `${platform}:${messageId}:${ruleId}:${targetKey}`;
    const result = await db.prepare(
        `INSERT OR IGNORE INTO message_distribution_delivery
         (delivery_key, rule_id, message_id, target, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(deliveryKey, ruleId, messageId, targetKey, Date.now()).run();
    return (result.meta.changes ?? 0) > 0;
}
