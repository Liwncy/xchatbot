import type {ChannelAdapter, RevokeResult} from '../types.js';
import {WEB_PLATFORM} from './types.js';

export const webAdapter: ChannelAdapter = {
    platform: WEB_PLATFORM,

    async send() {
        // 回复由 webhook 直接写进 HTTP JSON，不另推通道。
    },

    async revoke(): Promise<RevokeResult> {
        return {ok: false, reason: 'unsupported'};
    },
};
