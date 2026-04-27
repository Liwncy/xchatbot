import type {Env} from '../../types/message.js';
import type {
    SchedulerJobRecord,
    SchedulerJobRunRecord,
    SchedulerRunStatus,
    SchedulerTriggerSource,
} from '../types.js';
import type {Logger} from '../../utils/logger.js';

export interface SchedulerExecutionContext<TPayload = unknown> {
    env: Env;
    job: SchedulerJobRecord;
    payload: TPayload;
    run: SchedulerJobRunRecord;
    now: number;
    triggerSource: SchedulerTriggerSource;
    traceId: string;
    logger: Logger;
}

export interface SchedulerExecutionResult {
    status: Extract<SchedulerRunStatus, 'success' | 'skipped'>;
    message?: string;
    result?: unknown;
    retryAfterSec?: number;
}

export interface SchedulerExecutor<TPayload = unknown> {
    key: string;
    description: string;
    timeoutMs?: number;
    supportsManualTrigger?: boolean;
    validate(payload: unknown): TPayload;
    execute(context: SchedulerExecutionContext<TPayload>): Promise<SchedulerExecutionResult>;
}

export interface SchedulerExecutorMetadata {
    key: string;
    description: string;
    timeoutMs?: number;
    supportsManualTrigger: boolean;
}

