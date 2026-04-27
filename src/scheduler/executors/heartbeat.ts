import type {SchedulerExecutor} from './types.js';
import {ensurePlainObject, stringifyJson} from '../utils.js';

interface HeartbeatPayload {
    kvKey?: string;
    logMessage?: string;
}

export const heartbeatExecutor: SchedulerExecutor<HeartbeatPayload> = {
    key: 'heartbeat',
    description: '写入心跳日志，可选同步写入 KV 键',
    supportsManualTrigger: true,
    validate(payload: unknown): HeartbeatPayload {
        if (payload == null) return {};
        const record = ensurePlainObject(payload, 'payload');
        const kvKey = typeof record.kvKey === 'string' ? record.kvKey.trim() : '';
        const logMessage = typeof record.logMessage === 'string' ? record.logMessage.trim() : '';
        return {
            kvKey: kvKey || undefined,
            logMessage: logMessage || undefined,
        };
    },
    async execute(context) {
        const details = {
            traceId: context.traceId,
            triggerSource: context.triggerSource,
            jobId: context.job.id,
            jobKey: context.job.jobKey,
            namespace: context.job.namespace,
            executedAt: context.now,
        };
        const logMessage = context.payload.logMessage || `scheduler heartbeat: ${context.job.namespace}/${context.job.jobKey}`;
        if (context.payload.kvKey) {
            await context.env.XBOT_KV.put(context.payload.kvKey, stringifyJson(details));
        }
        context.logger.info(logMessage, details);
        return {
            status: 'success',
            message: logMessage,
            result: details,
        };
    },
};

