import {schedulerExecutorRegistry} from '../scheduler/executors/registry.js';
import {heartbeatExecutor} from './heartbeat.js';
import {sendWechatTextExecutor} from './send-wechat-text.js';

schedulerExecutorRegistry.register(heartbeatExecutor);
schedulerExecutorRegistry.register(sendWechatTextExecutor);

