export type MessageSource = 'private' | 'group' | 'official';

export type MessageType = 'text' | 'image' | 'emoji' | 'voice' | 'video' | 'link' | 'hongbao' | 'unknown';

export interface QuoteMessageId {
    newId: number;
    newIdText?: string;
    clientId?: number;
    clientIdText?: string;
    createTime: number;
}

export interface InboundMedia {
    url?: string;
    md5?: string;
    thumbUrl?: string;
    duration?: number;
    format?: string;
    aesKey?: string;
    fileId?: string;
    /** 已传到 upfile 的公网地址，追问时从会话记录回灌。 */
    publicUrl?: string;
    videoPublicUrl?: string;
}

export interface InboundArticle {
    title: string;
    url: string;
    desc?: string;
    thumbUrl?: string;
}

export interface InboundAppMessage {
    appType?: number;
    title?: string;
    url?: string;
    desc?: string;
    thumbUrl?: string;
    articles?: InboundArticle[];
}

export interface QuoteRef {
    title: string;
    referType: number;
    referContent?: string;
    referFrom?: string;
    referSenderName?: string;
    referMessageId?: QuoteMessageId;
    media?: InboundMedia;
}

export interface MentionRef {
    id: string;
    name?: string;
}

export interface IncomingMessage {
    platform: string;
    type: MessageType;
    source: MessageSource;
    /** 当前会话：群 ID、私聊用户 ID 或公众号 ID。 */
    chatId: string;
    /** 实际发送人；群聊里是成员 ID，私聊/公众号里通常与 chatId 相同。 */
    senderId: string;
    senderName?: string;
    to: string;
    timestamp: number;
    messageId: string;
    content?: string;
    quote?: QuoteRef;
    media?: InboundMedia;
    mentions?: MentionRef[];
    hongbao?: {nativeUrl: string};
    /** 已从 appmsg / 订阅号 XML 规范化的跨适配器内容。 */
    app?: InboundAppMessage;
    /** Golem 推过来的原文，一般是 type=49 的 XML。 */
    rawXml?: string;
    raw: unknown;
}
