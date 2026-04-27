import type {ScheduledController, ExecutionContext} from '@cloudflare/workers-types';
import type {Env} from '../types/message.js';
import {logger} from '../utils/logger.js';
import {computeNextRunAt, resolveSchedulerTimezone, validateCronExpression} from './cron.js';
import {SchedulerCenter} from './center.js';
import {schedulerExecutorRegistry} from './executors/registry.js';
import {SchedulerRepository} from './repository.js';
import {
    DEFAULT_SCHEDULER_RETRY_BACKOFF_SECONDS,
    DEFAULT_SCHEDULER_TIMEZONE,
    MAX_SCHEDULER_LIST_LIMIT,
    type SchedulerCreateJobInput,
    type SchedulerCreateJobRequest,
    type SchedulerConcurrencyPolicy,
    type SchedulerJobRecord,
    type SchedulerJobRunRecord,
    type SchedulerJobRunView,
    type SchedulerJobView,
} from './types.js';
import {
    asNonNegativeInteger,
    asTrimmedString,
    buildTraceId,
    coerceUnixSeconds,
    errorMessage,
    ensurePlainObject,
    nowUnixSeconds,
    parseJsonValue,
} from './utils.js';

function normalizeConcurrencyPolicy(value: unknown): SchedulerConcurrencyPolicy {
    const policy = (
        value == null
            ? 'forbid'
            : asTrimmedString(value, 'concurrencyPolicy', {maxLength: 20})
    ) as SchedulerConcurrencyPolicy;
    if (policy !== 'forbid') {
        throw new Error('Only concurrencyPolicy=forbid is supported in MVP');
    }
    return policy;
}

export function createSchedulerRepository(env: Env): SchedulerRepository {
    return new SchedulerRepository(env.XBOT_DB);
}

export function createSchedulerCenter(env: Env): SchedulerCenter {
    return new SchedulerCenter(createSchedulerRepository(env));
}

export function toSchedulerJobView(job: SchedulerJobRecord): SchedulerJobView {
    return {
        ...job,
        payload: parseJsonValue(job.payloadJson),
    };
}

export function toSchedulerRunView(run: SchedulerJobRunRecord): SchedulerJobRunView {
    return {
        ...run,
        result: parseJsonValue(run.resultJson),
    };
}

export function listSchedulerExecutors() {
    return schedulerExecutorRegistry.list();
}

export async function handleScheduledDispatch(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
): Promise<void> {
    const workerInvocationId = buildTraceId('tick');
    const now = Math.floor(controller.scheduledTime / 1000) || nowUnixSeconds();
    const promise = createSchedulerCenter(env).dispatchDueJobs(env, {
        now,
        cron: controller.cron,
        workerInvocationId,
    });
    ctx.waitUntil(promise);
    try {
        await promise;
    } catch (error) {
        logger.error('scheduler dispatch failed', {
            cron: controller.cron,
            workerInvocationId,
            error: errorMessage(error),
        });
        throw error;
    }
}

export function normalizeListPagination(url: URL): {limit: number; offset: number} {
    const limit = Math.min(
        asNonNegativeInteger(url.searchParams.get('limit') ?? 20, 'limit', {defaultValue: 20, min: 1, max: MAX_SCHEDULER_LIST_LIMIT}),
        MAX_SCHEDULER_LIST_LIMIT,
    );
    const offset = asNonNegativeInteger(url.searchParams.get('offset') ?? 0, 'offset', {defaultValue: 0, min: 0});
    return {limit, offset};
}

export function normalizeCreateJobInput(body: unknown, now = nowUnixSeconds()): SchedulerCreateJobInput & {nextRunAt: number} {
    const request = ensurePlainObject(body, 'request') as SchedulerCreateJobRequest;
    const namespace = asTrimmedString(request.namespace, 'namespace', {maxLength: 80});
    const jobKey = asTrimmedString(request.jobKey, 'jobKey', {maxLength: 120});
    const name = asTrimmedString(request.name, 'name', {maxLength: 120});
    const executorKey = asTrimmedString(request.executorKey, 'executorKey', {maxLength: 80});
    const scheduleType = asTrimmedString(request.scheduleType, 'scheduleType', {maxLength: 20}) as SchedulerCreateJobInput['scheduleType'];
    if (!['cron', 'once', 'delay'].includes(scheduleType)) {
        throw new Error('scheduleType must be one of cron/once/delay');
    }
    if (!schedulerExecutorRegistry.get(executorKey)) {
        throw new Error(`Unsupported executorKey: ${executorKey}`);
    }
    const retryLimit = asNonNegativeInteger(request.retryLimit ?? 0, 'retryLimit', {defaultValue: 0, min: 0, max: 20});
    const retryBackoffSec = asNonNegativeInteger(request.retryBackoffSec ?? DEFAULT_SCHEDULER_RETRY_BACKOFF_SECONDS, 'retryBackoffSec', {
        defaultValue: DEFAULT_SCHEDULER_RETRY_BACKOFF_SECONDS,
        min: 1,
        max: 86400,
    });
    const concurrencyPolicy = normalizeConcurrencyPolicy(request.concurrencyPolicy);

    let cronExpr: string | null = null;
    let timezone: string | null = null;
    let nextRunAt: number;

    if (scheduleType === 'cron') {
        cronExpr = asTrimmedString(request.cronExpr, 'cronExpr', {maxLength: 120});
        validateCronExpression(cronExpr);
        timezone = resolveSchedulerTimezone(typeof request.timezone === 'string' ? request.timezone : DEFAULT_SCHEDULER_TIMEZONE);
        nextRunAt = computeNextRunAt(cronExpr, now, timezone);
    } else if (scheduleType === 'once') {
        nextRunAt = coerceUnixSeconds(request.runAt, 'runAt');
        if (nextRunAt <= now) {
            throw new Error('runAt must be in the future');
        }
    } else {
        const delaySeconds = asNonNegativeInteger(request.delaySeconds, 'delaySeconds', {min: 1, max: 86400 * 30});
        nextRunAt = now + delaySeconds;
    }

    const executor = schedulerExecutorRegistry.get(executorKey);
    executor?.validate(request.payload ?? {});

    return {
        namespace,
        jobKey,
        name,
        executorKey,
        scheduleType,
        cronExpr,
        timezone,
        payload: request.payload ?? {},
        runAt: scheduleType === 'once' ? nextRunAt : undefined,
        retryLimit,
        retryBackoffSec,
        concurrencyPolicy,
        misfirePolicy: typeof request.misfirePolicy === 'string' && request.misfirePolicy.trim()
            ? request.misfirePolicy.trim()
            : 'fire_once',
        nextRunAt,
    };
}

export function normalizeUpdateJobInput(
    existingJob: SchedulerJobRecord,
    body: unknown,
    now = nowUnixSeconds(),
): SchedulerCreateJobInput & {nextRunAt: number | null} {
    const request = ensurePlainObject(body, 'request') as SchedulerCreateJobRequest;
    const existingPayload = parseJsonValue(existingJob.payloadJson) ?? {};
    const namespace = request.namespace == null
        ? existingJob.namespace
        : asTrimmedString(request.namespace, 'namespace', {maxLength: 80});
    const jobKey = request.jobKey == null
        ? existingJob.jobKey
        : asTrimmedString(request.jobKey, 'jobKey', {maxLength: 120});
    const name = request.name == null
        ? existingJob.name
        : asTrimmedString(request.name, 'name', {maxLength: 120});
    const executorKey = request.executorKey == null
        ? existingJob.executorKey
        : asTrimmedString(request.executorKey, 'executorKey', {maxLength: 80});
    const scheduleType = request.scheduleType == null
        ? existingJob.scheduleType
        : asTrimmedString(request.scheduleType, 'scheduleType', {maxLength: 20}) as SchedulerCreateJobInput['scheduleType'];
    if (!['cron', 'once', 'delay'].includes(scheduleType)) {
        throw new Error('scheduleType must be one of cron/once/delay');
    }
    if (!schedulerExecutorRegistry.get(executorKey)) {
        throw new Error(`Unsupported executorKey: ${executorKey}`);
    }

    const payload = request.payload === undefined ? existingPayload : request.payload;
    const retryLimit = request.retryLimit == null
        ? existingJob.retryLimit
        : asNonNegativeInteger(request.retryLimit, 'retryLimit', {min: 0, max: 20});
    const retryBackoffSec = request.retryBackoffSec == null
        ? existingJob.retryBackoffSec
        : asNonNegativeInteger(request.retryBackoffSec, 'retryBackoffSec', {min: 1, max: 86400});
    const concurrencyPolicy = normalizeConcurrencyPolicy(request.concurrencyPolicy ?? existingJob.concurrencyPolicy);
    const misfirePolicy = typeof request.misfirePolicy === 'string' && request.misfirePolicy.trim()
        ? request.misfirePolicy.trim()
        : existingJob.misfirePolicy || 'fire_once';

    let cronExpr: string | null = null;
    let timezone: string | null = null;
    let nextRunAt: number | null;

    if (scheduleType === 'cron') {
        cronExpr = request.cronExpr == null
            ? existingJob.cronExpr
            : asTrimmedString(request.cronExpr, 'cronExpr', {maxLength: 120});
        if (!cronExpr) {
            throw new Error('cronExpr is required for cron scheduleType');
        }
        validateCronExpression(cronExpr);
        timezone = resolveSchedulerTimezone(
            typeof request.timezone === 'string'
                ? request.timezone
                : existingJob.timezone ?? DEFAULT_SCHEDULER_TIMEZONE,
        );
        nextRunAt = computeNextRunAt(cronExpr, now, timezone);
    } else if (scheduleType === 'once') {
        if (request.runAt != null) {
            nextRunAt = coerceUnixSeconds(request.runAt, 'runAt');
        } else if (request.delaySeconds != null) {
            nextRunAt = now + asNonNegativeInteger(request.delaySeconds, 'delaySeconds', {min: 1, max: 86400 * 30});
        } else {
            nextRunAt = existingJob.nextRunAt;
        }
        if (!nextRunAt || nextRunAt <= now) {
            throw new Error('runAt must be in the future for once scheduleType');
        }
    } else {
        if (request.delaySeconds != null) {
            nextRunAt = now + asNonNegativeInteger(request.delaySeconds, 'delaySeconds', {min: 1, max: 86400 * 30});
        } else if (request.runAt != null) {
            nextRunAt = coerceUnixSeconds(request.runAt, 'runAt');
        } else {
            nextRunAt = existingJob.nextRunAt && existingJob.nextRunAt > now
                ? existingJob.nextRunAt
                : now + retryBackoffSec;
        }
    }

    schedulerExecutorRegistry.get(executorKey)?.validate(payload);

    return {
        namespace,
        jobKey,
        name,
        executorKey,
        scheduleType,
        cronExpr,
        timezone,
        payload,
        runAt: scheduleType === 'once' ? nextRunAt ?? undefined : undefined,
        retryLimit,
        retryBackoffSec,
        concurrencyPolicy,
        misfirePolicy,
        nextRunAt,
    };
}



