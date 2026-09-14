import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../core/message.js';
import type {ReplyMessage} from '../core/reply.js';

export type RevokeReason = 'unsupported' | 'incomplete' | 'unavailable' | 'expired' | 'failed';

export interface RevokeResult {
    ok: boolean;
    reason?: RevokeReason;
}

export interface ChannelAdapter {
    readonly platform: string;
    send(message: IncomingMessage, replies: ReplyMessage[], env: Env): Promise<void>;
    revoke(message: IncomingMessage, env: Env): Promise<RevokeResult>;
}
