export const PEER_SHOUT_TYPES = ['fixed', 'tail', 'talk'] as const;
export const PEER_STATUSES = ['active', 'disabled'] as const;

export type PeerShoutType = (typeof PEER_SHOUT_TYPES)[number];
export type PeerStatus = (typeof PEER_STATUSES)[number];

export interface PeerRoute {
    id: number;
    scope: string;
    wxid: string;
    name: string;
    /** 会啥：点歌、写脚本、兜底。用来对题，不是 OpenClaw skill。 */
    topic: string;
    type: PeerShoutType;
    template: string;
    mention: boolean;
    example: string;
    fallback: boolean;
    status: PeerStatus;
    createdAt: number;
    updatedAt: number;
}

export interface PeerRouteInput {
    scope: string;
    wxid?: string;
    name: string;
    topic: string;
    template?: string;
    mention?: boolean;
    fallback?: boolean;
    status?: PeerStatus;
}

export interface PeerMatch {
    ok: boolean;
    fallback: boolean;
    route?: PeerRoute;
    ask: string;
    text: string;
    outbound: string;
    reply?: string;
}
