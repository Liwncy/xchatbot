export const DEFAULT_SCHEDULER_TIMEZONE = 'Asia/Shanghai';
export const DEFAULT_SCHEDULER_SCAN_LIMIT = 20;
export const DEFAULT_SCHEDULER_LEASE_SECONDS = 55;
export const DEFAULT_SCHEDULER_RETRY_BACKOFF_SECONDS = 60;
export const MAX_SCHEDULER_LIST_LIMIT = 100;

export type SchedulerJobStatus = 'active' | 'paused' | 'disabled';
export type SchedulerScheduleType = 'cron' | 'once' | 'delay';
export type SchedulerRunStatus = 'running' | 'success' | 'failed' | 'skipped';
export type SchedulerTriggerSource = 'scheduled' | 'manual' | 'retry';
export type SchedulerConcurrencyPolicy = 'forbid';

export interface SchedulerJobRecord {
    id: number;
    namespace: string;
    jobKey: string;
    name: string;
    status: SchedulerJobStatus;
    executorKey: string;
    scheduleType: SchedulerScheduleType;
    cronExpr: string | null;
    timezone: string | null;
    payloadJson: string;
    misfirePolicy: string;
    retryLimit: number;
    retryBackoffSec: number;
    retryCount: number;
    concurrencyPolicy: SchedulerConcurrencyPolicy;
    nextRunAt: number | null;
    lastRunAt: number | null;
    lastSuccessAt: number | null;
    lastError: string | null;
    leaseToken: string | null;
    leaseUntil: number | null;
    version: number;
    createdAt: number;
    updatedAt: number;
}

export interface SchedulerJobRunRecord {
    id: number;
    jobId: number;
    triggerSource: SchedulerTriggerSource;
    scheduledAt: number;
    startedAt: number;
    finishedAt: number | null;
    status: SchedulerRunStatus;
    attemptNo: number;
    workerInvocationId: string | null;
    durationMs: number | null;
    resultJson: string | null;
    errorText: string | null;
    createdAt: number;
}

export interface SchedulerJobView extends Omit<SchedulerJobRecord, 'payloadJson'> {
    payload: unknown;
}

export interface SchedulerJobRunView extends Omit<SchedulerJobRunRecord, 'resultJson'> {
    result: unknown;
}

export interface SchedulerListResult<T> {
    total: number;
    items: T[];
}

export interface SchedulerCreateJobInput {
    namespace: string;
    jobKey: string;
    name: string;
    executorKey: string;
    scheduleType: SchedulerScheduleType;
    cronExpr?: string | null;
    timezone?: string | null;
    payload: unknown;
    runAt?: number | null;
    retryLimit?: number;
    retryBackoffSec?: number;
    concurrencyPolicy?: SchedulerConcurrencyPolicy;
    misfirePolicy?: string;
}

export interface SchedulerCreateJobRequest {
    namespace?: unknown;
    jobKey?: unknown;
    name?: unknown;
    executorKey?: unknown;
    scheduleType?: unknown;
    cronExpr?: unknown;
    timezone?: unknown;
    payload?: unknown;
    runAt?: unknown;
    delaySeconds?: unknown;
    retryLimit?: unknown;
    retryBackoffSec?: unknown;
    concurrencyPolicy?: unknown;
    misfirePolicy?: unknown;
}

export interface SchedulerDispatchSummary {
    startedAt: number;
    finishedAt: number;
    scanned: number;
    claimed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    cron?: string;
}

export interface SchedulerManualTriggerResult {
    job: SchedulerJobView;
    run: SchedulerJobRunView;
}

