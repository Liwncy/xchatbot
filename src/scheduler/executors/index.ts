import {fakeForwardFlushExecutor} from './fake-forward-flush.js';
import {heartbeatExecutor} from './heartbeat.js';
import {schedulerExecutorRegistry} from './registry.js';
import {sendWechatTextExecutor} from './send-wechat-text.js';

schedulerExecutorRegistry.register(fakeForwardFlushExecutor);
schedulerExecutorRegistry.register(heartbeatExecutor);
schedulerExecutorRegistry.register(sendWechatTextExecutor);

export {schedulerExecutorRegistry} from './registry.js';
export {
    fakeForwardFlushExecutor,
    heartbeatExecutor,
    sendWechatTextExecutor,
};
export type {SchedulerExecutor, SchedulerExecutionContext, SchedulerExecutionResult, SchedulerExecutorMetadata} from './types.js';
