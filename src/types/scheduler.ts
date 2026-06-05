/** 调度任务状态。 */
export type SchedulerJobStatus = 'active' | 'paused' | 'disabled';

/** 调度计划类型。 */
export type SchedulerScheduleType = 'cron' | 'once' | 'delay';

/** 调度执行状态。 */
export type SchedulerRunStatus = 'running' | 'success' | 'failed' | 'skipped';

/** 调度触发来源。 */
export type SchedulerTriggerSource = 'scheduled' | 'manual' | 'retry';

/** 并发策略（当前 MVP 仅支持 forbid）。 */
export type SchedulerConcurrencyPolicy = 'forbid';

/** 调度任务对外展示模型。 */
export interface SchedulerJobView {
    id: number;
    namespace: string;
    jobKey: string;
    name: string;
    status: SchedulerJobStatus;
    executorKey: string;
    scheduleType: SchedulerScheduleType;
    cronExpr: string | null;
    timezone: string | null;
    payload: unknown;
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

/** 调度执行记录对外展示模型。 */
export interface SchedulerJobRunView {
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
    result: unknown;
    errorText: string | null;
    createdAt: number;
}

/** 列表分页结果。 */
export interface SchedulerListResult<T> {
    total: number;
    items: T[];
}

/** 调度任务创建/更新请求体（HTTP API 输入契约）。 */
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

/** 手动触发任务后的返回模型。 */
export interface SchedulerManualTriggerResult {
    job: SchedulerJobView;
    run: SchedulerJobRunView;
}

