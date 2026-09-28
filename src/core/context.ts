import type {ChannelAdapter} from '../adapter/types.js';
import type {Env} from '../types/env.js';

export interface PluginContext {
    env: Env;
    requestId: string;
    waitUntil: (promise: Promise<unknown>) => void;
    adapter?: ChannelAdapter;
    /** 跨通道分发时按平台取公共适配器；插件不接触具体协议实现。 */
    resolveAdapter?: (platform: string) => ChannelAdapter | undefined;
}
