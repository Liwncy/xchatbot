/**
 * 喊法三种，名字故意拉开：
 * - fixed 照念：整句没有空格，原样发。
 * - param 带参：口令词 + `{问}`，把要办的内容填进去。
 * - chat 人话：没有口令，@他 加上原话。
 */
export const PEER_SHOUT_TYPES = ['fixed', 'param', 'chat'] as const;
export const PEER_STATUSES = ['active', 'disabled'] as const;
/** manual：有人明说记下的，自动整理不改它、也不在它旁边再挂一个人；auto：整理聊天时攒出来的，可以被同一件事的新条目换掉。 */
export const PEER_SOURCES = ['manual', 'auto'] as const;

/** 对不上任何路线时找他的那条路线，title 就叫这个。 */
export const FALLBACK_TITLE = '兜底';

export type PeerShoutType = (typeof PEER_SHOUT_TYPES)[number];
export type PeerStatus = (typeof PEER_STATUSES)[number];
export type PeerSource = (typeof PEER_SOURCES)[number];

/**
 * 花名册一行：某个群里，谁会办哪件事，以及怎么喊他。
 * 字段按用途分组；同一个群、同一个人、同一个 title 只有一行（session_id + member_id + title 唯一）。
 */
export interface PeerRoute {
    id: number;

    // ── 哪个群、谁 ──
    /** 哪个群：和 chat_message.session_id 同一种写法（群 id 本身）。 */
    sessionId: string;
    /** 他的微信 id。手填时可以空。 */
    memberId: string;
    /** 花名，@ 他和列表里显示用。 */
    memberName: string;

    // ── 会啥 ──
    /** 线路名：点歌、发表情、兜底。短而稳，代码只认它（同一个人同一个 title 一行，同一个群里同一个 title 自动收的只留一个人）。 */
    title: string;
    /** 具体的事：一句话，写给 AI 读，比如「点歌、放歌曲、来一首歌，说歌名或歌手」。AI 靠它判断这件事算不算这条，代码不拿它做匹配。 */
    about: string;

    // ── 怎么喊 ──
    /** 喊法原文：空=人话；含 `{问}`=带参（`music {问}`、`发{问}表情`）；其余整句照念。喊法以它为准。 */
    template: string;
    /** 喊法的类型，是 template 的结果（空→chat，含 `{问}`→param，其余→fixed），存下来只是读着方便。 */
    type: PeerShoutType;
    /** 发出去要不要 @ 他。默认照念不 @、其余 @。 */
    mention: boolean;
    /** 一句例子（`老鼠爱大米`），只在搜索和列表里用，不参与发送。 */
    example: string;

    // ── 状态 ──
    /** active 在用；disabled 停用，不再列出，也不会被自动收复活。 */
    status: PeerStatus;
    /** 谁记的：manual 有人明说的；auto 整理聊天攒的。 */
    source: PeerSource;

    // ── 时间（毫秒） ──
    createdAt: number;
    /** 最后一次写入。 */
    updatedAt: number;
}

/** 写入花名册。入参沿用工具那边的叫法（scope / wxid / name），落库时由仓库层转成 session_id 等。 */
export interface PeerRouteInput {
    scope: string;
    wxid?: string;
    name: string;
    title: string;
    /** 具体的事。不填就用 title。 */
    about?: string;
    template?: string;
    mention?: boolean;
    status?: PeerStatus;
    source?: PeerSource;
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
