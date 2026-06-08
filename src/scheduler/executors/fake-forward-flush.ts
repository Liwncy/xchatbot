import type {SchedulerExecutor} from './types.js';
import {ensurePlainObject} from '../utils.js';
import {FakeForwardService} from '../../plugins/toolkits/fake-forward/fake-forward-service.js';
import type {FakeForwardFlushPayload} from '../../plugins/toolkits/fake-forward/fake-forward-types.js';

const fakeForwardService = new FakeForwardService();

export const fakeForwardFlushExecutor: SchedulerExecutor<FakeForwardFlushPayload> = {
    key: 'fake-forward-flush',
    description: '自动发送伪转发草稿',
    supportsManualTrigger: true,
    validate(payload: unknown): FakeForwardFlushPayload {
        const record = ensurePlainObject(payload, 'payload');
        const sessionKey = typeof record.sessionKey === 'string' ? record.sessionKey.trim() : '';
        const version = Number(record.version);
        if (!sessionKey) {
            throw new Error('payload.sessionKey is required');
        }
        if (!Number.isInteger(version) || version <= 0) {
            throw new Error('payload.version must be a positive integer');
        }
        return {sessionKey, version};
    },
    async execute(context) {
        const result = await fakeForwardService.flushDraftFromScheduler(context.env, context.payload);
        return {
            status: result.status,
            message: result.status === 'success' ? `Flushed fake-forward draft ${context.payload.sessionKey}` : 'Skipped fake-forward draft flush',
            result: result.result,
        };
    },
};

