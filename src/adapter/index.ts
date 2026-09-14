import {golemAdapter} from './golem/channel.js';
import {webAdapter} from './web/channel.js';
import type {ChannelAdapter} from './types.js';

const adapters: Record<string, ChannelAdapter> = {
    [golemAdapter.platform]: golemAdapter,
    [webAdapter.platform]: webAdapter,
};

export function getAdapter(platform: string): ChannelAdapter | undefined {
    return adapters[platform];
}

export type {ChannelAdapter, RevokeReason, RevokeResult} from './types.js';
