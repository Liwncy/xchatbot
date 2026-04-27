import type {Env} from '../types/message.js';
import {logger} from '../utils/logger.js';
import {computeNextRunAt} from './cron.js';
import {schedulerExecutorRegistry} from './executors/index.js';
import type {SchedulerExecutionResult} from './executors/types.js';
import {SchedulerRepository} from './repository.js';
import {
    DEFAULT_SCHEDULER_LEASE_SECONDS,
    DEFAULT_SCHEDULER_SCAN_LIMIT,
    type SchedulerDispatchSummary,
    type SchedulerJobRecord,
    type SchedulerJobRunRecord,
    type SchedulerTriggerSource,
} from './types.js';
import {buildTraceId, errorMessage, nowUnixSeconds, parseJsonValue, truncateText} from './utils.js';

export class SchedulerCenter {
    constructor(
        private readonly repository: SchedulerRepository,
        private readonly leaseSeconds = DEFAULT_SCHEDULER_LEASE_SECONDS,
    ) {}

    async dispatchDueJobs(
        env: Env,
        options?: {limit?: number; now?: number; cron?: string; workerInvocationId?: string},
    ): Promise<SchedulerDispatchSummary> {
        const startedAt = options?.now ?? nowUnixSeconds();
        const summary: SchedulerDispatchSummary = {
            startedAt,
            finishedAt: startedAt,
            scanned: 0,
            claimed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            cron: options?.cron,
        };

        const dueJobs = await this.repository.listDueJobs(startedAt, options?.limit ?? DEFAULT_SCHEDULER_SCAN_LIMIT);
        summary.scanned = dueJobs.length;

        for (const job of dueJobs) {
            const triggerSource: SchedulerTriggerSource = job.retryCount > 0 ? 'retry' : 'scheduled';
            const executed = await this.executeJob(job.id, env, {
                triggerSource,
                workerInvocationId: options?.workerInvocationId,
                now: startedAt,
                preserveSchedule: false,
            });
            if (!executed) {
                summary.skipped += 1;
                continue;
            }
            summary.claimed += 1;
            if (executed.run.status === 'success') {
                summary.succeeded += 1;
            } else {
                summary.failed += 1;
            }
        }

        summary.finishedAt = nowUnixSeconds();
        logger.info('scheduler dispatch finished', summary);
        return summary;
    }

    async triggerJobNow(
        jobId: number,
        env: Env,
        options?: {workerInvocationId?: string; now?: number},
    ): Promise<{job: SchedulerJobRecord; run: SchedulerJobRunRecord} | null> {
        return this.executeJob(jobId, env, {
            triggerSource: 'manual',
            workerInvocationId: options?.workerInvocationId,
            now: options?.now ?? nowUnixSeconds(),
            preserveSchedule: true,
        });
    }

    private async executeJob(
        jobId: number,
        env: Env,
        options: {
            triggerSource: SchedulerTriggerSource;
            workerInvocationId?: string;
            now: number;
            preserveSchedule: boolean;
        },
    ): Promise<{job: SchedulerJobRecord; run: SchedulerJobRunRecord} | null> {
        const leaseToken = buildTraceId('lease');
        const claimedJob = await this.repository.tryAcquireLease(
            jobId,
            leaseToken,
            options.now,
            options.now + this.leaseSeconds,
            options.triggerSource === 'manual',
        );
        if (!claimedJob) return null;

        const attemptNo = options.triggerSource === 'retry' ? claimedJob.retryCount + 1 : 1;
        const run = await this.repository.createRun({
            jobId: claimedJob.id,
            triggerSource: options.triggerSource,
            scheduledAt: claimedJob.nextRunAt ?? options.now,
            startedAt: options.now,
            attemptNo,
            workerInvocationId: options.workerInvocationId,
        });

        const executor = schedulerExecutorRegistry.get(claimedJob.executorKey);
        if (!executor) {
            const message = `Scheduler executor not found: ${claimedJob.executorKey}`;
            await this.repository.markRunFailure(run.id, options.now, message);
            await this.repository.markJobFailure({
                job: claimedJob,
                leaseToken,
                now: options.now,
                errorText: message,
                nextRunAt: null,
                retryCount: claimedJob.retryCount,
                paused: true,
                preserveSchedule: options.preserveSchedule,
            });
            return {
                job: (await this.repository.getJobById(claimedJob.id)) ?? claimedJob,
                run: (await this.repository.getRunById(run.id)) ?? run,
            };
        }

        try {
            const payload = executor.validate(parseJsonValue(claimedJob.payloadJson));
            const traceId = buildTraceId('run');
            const result = await executor.execute({
                env,
                job: claimedJob,
                payload,
                run,
                now: options.now,
                triggerSource: options.triggerSource,
                traceId,
                logger,
            });
            const finalResult = result ?? ({status: 'success'} satisfies SchedulerExecutionResult);
            const nextRunAt = options.preserveSchedule ? claimedJob.nextRunAt : this.resolveNextRunAt(claimedJob, options.now, finalResult);
            await this.repository.markRunSuccess(run.id, options.now, {
                message: finalResult.message,
                result: finalResult.result,
                triggerSource: options.triggerSource,
            });
            await this.repository.markJobSuccess({
                job: claimedJob,
                leaseToken,
                now: options.now,
                nextRunAt,
                preserveSchedule: options.preserveSchedule,
                clearError: true,
            });
        } catch (error) {
            const message = truncateText(errorMessage(error), 2000);
            const retryCount = options.preserveSchedule ? claimedJob.retryCount : claimedJob.retryCount + 1;
            const shouldRetry = !options.preserveSchedule && retryCount <= claimedJob.retryLimit;
            const nextRunAt = shouldRetry ? options.now + claimedJob.retryBackoffSec : null;
            await this.repository.markRunFailure(run.id, options.now, message);
            await this.repository.markJobFailure({
                job: claimedJob,
                leaseToken,
                now: options.now,
                errorText: message,
                nextRunAt,
                retryCount,
                paused: !shouldRetry,
                preserveSchedule: options.preserveSchedule,
            });
        }

        return {
            job: (await this.repository.getJobById(claimedJob.id)) ?? claimedJob,
            run: (await this.repository.getRunById(run.id)) ?? run,
        };
    }

    private resolveNextRunAt(job: SchedulerJobRecord, now: number, result: SchedulerExecutionResult): number | null {
        if (result.status === 'skipped') {
            return job.nextRunAt;
        }
        if (job.scheduleType === 'cron') {
            if (!job.cronExpr) {
                throw new Error(`Cron job ${job.id} is missing cron_expr`);
            }
            return computeNextRunAt(job.cronExpr, now, job.timezone);
        }
        return null;
    }
}

