import type {
    SchedulerConcurrencyPolicy,
    SchedulerJobStatus,
    SchedulerRunStatus,
    SchedulerScheduleType,
    SchedulerTriggerSource,
} from '../types/scheduler.js';

export const DEFAULT_SCHEDULER_TIMEZONE = 'Asia/Shanghai';
export const DEFAULT_SCHEDULER_SCAN_LIMIT = 20;
export const DEFAULT_SCHEDULER_LEASE_SECONDS = 55;
export const DEFAULT_SCHEDULER_RETRY_BACKOFF_SECONDS = 60;
export const MAX_SCHEDULER_LIST_LIMIT = 100;

export type {
    SchedulerConcurrencyPolicy,
    SchedulerCreateJobRequest,
    SchedulerJobRunView,
    SchedulerJobStatus,
    SchedulerJobView,
    SchedulerListResult,
    SchedulerRunStatus,
    SchedulerScheduleType,
    SchedulerTriggerSource,
} from '../types/scheduler.js';

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


