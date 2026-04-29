import type {
    SchedulerConcurrencyPolicy,
    SchedulerCreateJobInput,
    SchedulerJobRecord,
    SchedulerJobRunRecord,
    SchedulerListResult,
    SchedulerRunStatus,
    SchedulerTriggerSource,
} from './types.js';
import {stringifyJson, truncateText} from './utils.js';

function toNumber(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function toStringValue(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value);
}

function toNullableString(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value);
    return text;
}

function mapJobRow(row: Record<string, unknown>): SchedulerJobRecord {
    return {
        id: toNumber(row.id),
        namespace: toStringValue(row.namespace),
        jobKey: toStringValue(row.job_key),
        name: toStringValue(row.name),
        status: toStringValue(row.status) as SchedulerJobRecord['status'],
        executorKey: toStringValue(row.executor_key),
        scheduleType: toStringValue(row.schedule_type) as SchedulerJobRecord['scheduleType'],
        cronExpr: toNullableString(row.cron_expr),
        timezone: toNullableString(row.timezone),
        payloadJson: toStringValue(row.payload_json, 'null'),
        misfirePolicy: toStringValue(row.misfire_policy),
        retryLimit: toNumber(row.retry_limit),
        retryBackoffSec: toNumber(row.retry_backoff_sec),
        retryCount: toNumber(row.retry_count),
        concurrencyPolicy: toStringValue(row.concurrency_policy) as SchedulerConcurrencyPolicy,
        nextRunAt: toNullableNumber(row.next_run_at),
        lastRunAt: toNullableNumber(row.last_run_at),
        lastSuccessAt: toNullableNumber(row.last_success_at),
        lastError: toNullableString(row.last_error),
        leaseToken: toNullableString(row.lease_token),
        leaseUntil: toNullableNumber(row.lease_until),
        version: toNumber(row.version),
        createdAt: toNumber(row.created_at),
        updatedAt: toNumber(row.updated_at),
    };
}

function mapRunRow(row: Record<string, unknown>): SchedulerJobRunRecord {
    return {
        id: toNumber(row.id),
        jobId: toNumber(row.job_id),
        triggerSource: toStringValue(row.trigger_source) as SchedulerTriggerSource,
        scheduledAt: toNumber(row.scheduled_at),
        startedAt: toNumber(row.started_at),
        finishedAt: toNullableNumber(row.finished_at),
        status: toStringValue(row.status) as SchedulerRunStatus,
        attemptNo: toNumber(row.attempt_no),
        workerInvocationId: toNullableString(row.worker_invocation_id),
        durationMs: toNullableNumber(row.duration_ms),
        resultJson: toNullableString(row.result_json),
        errorText: toNullableString(row.error_text),
        createdAt: toNumber(row.created_at),
    };
}

export class SchedulerRepository {
    constructor(private readonly db: D1Database) {}

    async listJobs(limit: number, offset: number): Promise<SchedulerListResult<SchedulerJobRecord>> {
        const [rows, totalRow] = await Promise.all([
            this.db
                .prepare(
                    `SELECT * FROM scheduler_jobs
                     ORDER BY id DESC
                     LIMIT ?1 OFFSET ?2`,
                )
                .bind(limit, offset)
                .all<Record<string, unknown>>(),
            this.db.prepare('SELECT COUNT(1) AS cnt FROM scheduler_jobs').first<Record<string, unknown>>(),
        ]);
        return {
            total: toNumber(totalRow?.cnt),
            items: (rows.results ?? []).map(mapJobRow),
        };
    }

    async getJobById(id: number): Promise<SchedulerJobRecord | null> {
        const row = await this.db
            .prepare('SELECT * FROM scheduler_jobs WHERE id = ?1 LIMIT 1')
            .bind(id)
            .first<Record<string, unknown>>();
        return row ? mapJobRow(row) : null;
    }

    async getJobByNamespaceAndKey(namespace: string, jobKey: string): Promise<SchedulerJobRecord | null> {
        const row = await this.db
            .prepare('SELECT * FROM scheduler_jobs WHERE namespace = ?1 AND job_key = ?2 LIMIT 1')
            .bind(namespace, jobKey)
            .first<Record<string, unknown>>();
        return row ? mapJobRow(row) : null;
    }

    async listRunsByJobId(jobId: number, limit: number, offset: number): Promise<SchedulerListResult<SchedulerJobRunRecord>> {
        const [rows, totalRow] = await Promise.all([
            this.db
                .prepare(
                    `SELECT * FROM scheduler_job_runs
                     WHERE job_id = ?1
                     ORDER BY id DESC
                     LIMIT ?2 OFFSET ?3`,
                )
                .bind(jobId, limit, offset)
                .all<Record<string, unknown>>(),
            this.db
                .prepare('SELECT COUNT(1) AS cnt FROM scheduler_job_runs WHERE job_id = ?1')
                .bind(jobId)
                .first<Record<string, unknown>>(),
        ]);
        return {
            total: toNumber(totalRow?.cnt),
            items: (rows.results ?? []).map(mapRunRow),
        };
    }

    async getRunById(id: number): Promise<SchedulerJobRunRecord | null> {
        const row = await this.db
            .prepare('SELECT * FROM scheduler_job_runs WHERE id = ?1 LIMIT 1')
            .bind(id)
            .first<Record<string, unknown>>();
        return row ? mapRunRow(row) : null;
    }

    async listDueJobs(now: number, limit: number): Promise<SchedulerJobRecord[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM scheduler_jobs
                 WHERE status = 'active'
                   AND next_run_at IS NOT NULL
                   AND next_run_at <= ?1
                 ORDER BY next_run_at ASC, id ASC
                 LIMIT ?2`,
            )
            .bind(now, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(mapJobRow);
    }

    async createJob(input: SchedulerCreateJobInput & {now: number; nextRunAt: number}): Promise<SchedulerJobRecord> {
        const result = await this.db
            .prepare(
                `INSERT INTO scheduler_jobs (
                    namespace, job_key, name, status, executor_key,
                    schedule_type, cron_expr, timezone, payload_json,
                    misfire_policy, retry_limit, retry_backoff_sec, retry_count,
                    concurrency_policy, next_run_at, version, created_at, updated_at
                ) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?13, 0, ?14, ?14)`,
            )
            .bind(
                input.namespace,
                input.jobKey,
                input.name,
                input.executorKey,
                input.scheduleType,
                input.cronExpr ?? null,
                input.timezone ?? null,
                stringifyJson(input.payload),
                input.misfirePolicy ?? 'fire_once',
                input.retryLimit ?? 0,
                input.retryBackoffSec ?? 60,
                input.concurrencyPolicy ?? 'forbid',
                input.nextRunAt,
                input.now,
            )
            .run();
        return this.requireJobById(Number(result.meta.last_row_id));
    }

    async updateJob(
        id: number,
        input: SchedulerCreateJobInput & {now: number; nextRunAt: number | null},
    ): Promise<SchedulerJobRecord | null> {
        const result = await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET namespace = ?2,
                     job_key = ?3,
                     name = ?4,
                     executor_key = ?5,
                     schedule_type = ?6,
                     cron_expr = ?7,
                     timezone = ?8,
                     payload_json = ?9,
                     misfire_policy = ?10,
                     retry_limit = ?11,
                     retry_backoff_sec = ?12,
                     retry_count = 0,
                     concurrency_policy = ?13,
                     next_run_at = ?14,
                     last_error = NULL,
                     lease_token = NULL,
                     lease_until = NULL,
                     updated_at = ?15,
                     version = version + 1
                 WHERE id = ?1`,
            )
            .bind(
                id,
                input.namespace,
                input.jobKey,
                input.name,
                input.executorKey,
                input.scheduleType,
                input.cronExpr ?? null,
                input.timezone ?? null,
                stringifyJson(input.payload),
                input.misfirePolicy ?? 'fire_once',
                input.retryLimit ?? 0,
                input.retryBackoffSec ?? 60,
                input.concurrencyPolicy ?? 'forbid',
                input.nextRunAt,
                input.now,
            )
            .run();
        if ((result.meta.changes ?? 0) === 0) return null;
        return this.requireJobById(id);
    }

    async pauseJob(id: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET status = 'paused', lease_token = NULL, lease_until = NULL, updated_at = ?2, version = version + 1
                 WHERE id = ?1`,
            )
            .bind(id, now)
            .run();
        return (result.meta.changes ?? 0) > 0;
    }

    async resumeJob(id: number, nextRunAt: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET status = 'active', next_run_at = ?2, updated_at = ?3, version = version + 1
                 WHERE id = ?1`,
            )
            .bind(id, nextRunAt, now)
            .run();
        return (result.meta.changes ?? 0) > 0;
    }

    async tryAcquireLease(
        jobId: number,
        leaseToken: string,
        now: number,
        leaseUntil: number,
        allowAnyStatus = false,
    ): Promise<SchedulerJobRecord | null> {
        const statusClause = allowAnyStatus ? '' : `AND status = 'active'`;
        const result = await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET lease_token = ?2,
                     lease_until = ?3,
                     updated_at = ?4,
                     version = version + 1
                 WHERE id = ?1
                   ${statusClause}
                   AND (lease_until IS NULL OR lease_until < ?4)`,
            )
            .bind(jobId, leaseToken, leaseUntil, now)
            .run();
        if ((result.meta.changes ?? 0) === 0) return null;
        return this.requireJobById(jobId);
    }

    async createRun(input: {
        jobId: number;
        triggerSource: SchedulerTriggerSource;
        scheduledAt: number;
        startedAt: number;
        attemptNo: number;
        workerInvocationId?: string | null;
    }): Promise<SchedulerJobRunRecord> {
        const result = await this.db
            .prepare(
                `INSERT INTO scheduler_job_runs (
                    job_id, trigger_source, scheduled_at, started_at,
                    status, attempt_no, worker_invocation_id, created_at
                ) VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?4)`,
            )
            .bind(
                input.jobId,
                input.triggerSource,
                input.scheduledAt,
                input.startedAt,
                input.attemptNo,
                input.workerInvocationId ?? null,
            )
            .run();
        return this.requireRunById(Number(result.meta.last_row_id));
    }

    async markRunSuccess(runId: number, finishedAt: number, result: unknown): Promise<void> {
        const resultText = truncateText(stringifyJson(result), 4000);
        await this.db
            .prepare(
                `UPDATE scheduler_job_runs
                 SET finished_at = ?2,
                     status = 'success',
                     duration_ms = (?2 - started_at) * 1000,
                     result_json = ?3,
                     error_text = NULL
                 WHERE id = ?1`,
            )
            .bind(runId, finishedAt, resultText)
            .run();
    }

    async markRunFailure(runId: number, finishedAt: number, errorText: string): Promise<void> {
        await this.db
            .prepare(
                `UPDATE scheduler_job_runs
                 SET finished_at = ?2,
                     status = 'failed',
                     duration_ms = (?2 - started_at) * 1000,
                     error_text = ?3
                 WHERE id = ?1`,
            )
            .bind(runId, finishedAt, truncateText(errorText, 2000))
            .run();
    }

    async markJobSuccess(input: {
        job: SchedulerJobRecord;
        leaseToken: string;
        now: number;
        nextRunAt: number | null;
        preserveSchedule: boolean;
        clearError?: boolean;
    }): Promise<void> {
        const nextStatus = input.preserveSchedule
            ? input.job.status
            : input.job.scheduleType === 'cron'
                ? 'active'
                : 'disabled';
        const nextRunAt = input.preserveSchedule ? input.job.nextRunAt : input.nextRunAt;
        await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET status = ?2,
                     next_run_at = ?3,
                     last_run_at = ?4,
                     last_success_at = ?4,
                     last_error = ?5,
                     retry_count = ?6,
                     lease_token = NULL,
                     lease_until = NULL,
                     updated_at = ?4,
                     version = version + 1
                 WHERE id = ?1 AND lease_token = ?7`,
            )
            .bind(
                input.job.id,
                nextStatus,
                nextRunAt,
                input.now,
                input.clearError === false ? input.job.lastError : null,
                input.preserveSchedule ? input.job.retryCount : 0,
                input.leaseToken,
            )
            .run();
    }

    async markJobFailure(input: {
        job: SchedulerJobRecord;
        leaseToken: string;
        now: number;
        errorText: string;
        nextRunAt: number | null;
        retryCount: number;
        paused: boolean;
        preserveSchedule: boolean;
    }): Promise<void> {
        const nextStatus = input.preserveSchedule
            ? input.job.status
            : input.paused
                ? 'paused'
                : 'active';
        const nextRunAt = input.preserveSchedule ? input.job.nextRunAt : input.nextRunAt;
        const retryCount = input.preserveSchedule ? input.job.retryCount : input.retryCount;
        await this.db
            .prepare(
                `UPDATE scheduler_jobs
                 SET status = ?2,
                     next_run_at = ?3,
                     last_run_at = ?4,
                     last_error = ?5,
                     retry_count = ?6,
                     lease_token = NULL,
                     lease_until = NULL,
                     updated_at = ?4,
                     version = version + 1
                 WHERE id = ?1 AND lease_token = ?7`,
            )
            .bind(
                input.job.id,
                nextStatus,
                nextRunAt,
                input.now,
                truncateText(input.errorText, 2000),
                retryCount,
                input.leaseToken,
            )
            .run();
    }

    private async requireJobById(id: number): Promise<SchedulerJobRecord> {
        const job = await this.getJobById(id);
        if (!job) throw new Error(`Scheduler job ${id} not found`);
        return job;
    }

    private async requireRunById(id: number): Promise<SchedulerJobRunRecord> {
        const run = await this.getRunById(id);
        if (!run) throw new Error(`Scheduler run ${id} not found`);
        return run;
    }
}


