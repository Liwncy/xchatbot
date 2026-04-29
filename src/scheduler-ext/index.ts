import {schedulerExecutorRegistry} from '../scheduler/executors/registry.js';
import {fakeForwardFlushExecutor} from './fake-forward-flush.js';
import {heartbeatExecutor} from './heartbeat.js';
import {sendWechatTextExecutor} from './send-wechat-text.js';

schedulerExecutorRegistry.register(fakeForwardFlushExecutor);
schedulerExecutorRegistry.register(heartbeatExecutor);
schedulerExecutorRegistry.register(sendWechatTextExecutor);

