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

export interface SendOptions {
    /** 非文字消息失败后，是否在目标会话补发提示。 */
    failureNotice?: boolean;
}

export interface PrepareDistributionOptions {
    /** 按正文顺序展开文章，供消息合集等重建方式使用。 */
    expandArticle?: boolean;
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
    /** 是否能脱离当前请求，主动发到任意群或用户。 */
    readonly supportsProactiveSend?: boolean;
    send(message: IncomingMessage, replies: ReplyMessage[], env: Env, options?: SendOptions): Promise<SendReceipt[]>;
    revoke(message: IncomingMessage, env: Env): Promise<RevokeResult>;
    /** 将来源平台的私有媒体信息补全为可跨适配器使用的标准消息。 */
    prepareForDistribution?(
        message: IncomingMessage,
        env: Env,
        options?: PrepareDistributionOptions,
    ): Promise<IncomingMessage>;
    /** 将标准入站消息转换为当前适配器可原样发送的回复。 */
    toOutboundReplies?(message: IncomingMessage, env: Env): Promise<ReplyMessage[] | null>;
    searchDirectory?(query: string, env: Env): Promise<DirectoryPerson[]>;
    findRoomMember?(roomId: string, name: string, env: Env): Promise<RoomMember | null>;
    toOutboundText?(reply: ReplyMessage): string | null;
    claimHongbao?(nativeUrl: string, scene: HongbaoScene, env: Env): Promise<HongbaoClaimResult>;
}
