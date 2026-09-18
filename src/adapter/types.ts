import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../core/message.js';
import type {ReplyMessage} from '../core/reply.js';

export type RevokeReason = 'unsupported' | 'incomplete' | 'unavailable' | 'expired' | 'failed';

export interface RevokeResult {
    ok: boolean;
    reason?: RevokeReason;
}

export interface SendReceipt {
    ok: boolean;
    outboundId?: string;
    revoke?: {
        newId?: string;
        clientId?: string;
        createTime?: number;
    };
    data?: unknown;
}

export interface DirectoryPerson {
    id: string;
    nickname: string;
    alias?: string;
    avatarUrl?: string;
    region?: string;
    sign?: string;
    gender?: number;
    verified?: boolean;
    cardReady?: boolean;
}

export interface RoomMember {
    id: string;
    name: string;
    nickname?: string;
    avatarUrl?: string;
}

export type HongbaoScene = 'group' | 'private';

export interface HongbaoClaimResult {
    ok: boolean;
    amountFen?: number;
    reason?: 'unavailable' | 'failed';
}

export interface ChannelAdapter {
    readonly platform: string;
    send(message: IncomingMessage, replies: ReplyMessage[], env: Env): Promise<SendReceipt[]>;
    revoke(message: IncomingMessage, env: Env): Promise<RevokeResult>;
    searchDirectory?(query: string, env: Env): Promise<DirectoryPerson[]>;
    findRoomMember?(roomId: string, name: string, env: Env): Promise<RoomMember | null>;
    toOutboundText?(reply: ReplyMessage): string | null;
    claimHongbao?(nativeUrl: string, scene: HongbaoScene, env: Env): Promise<HongbaoClaimResult>;
}
