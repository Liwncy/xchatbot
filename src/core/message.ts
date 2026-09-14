export type MessageSource = 'private' | 'group' | 'official';

export type MessageType = 'text' | 'image' | 'emoji' | 'voice' | 'video' | 'link' | 'unknown';

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

export interface QuoteRef {
    title: string;
    referType: number;
    referContent?: string;
    referFrom?: string;
    referSenderName?: string;
    referMessageId?: QuoteMessageId;
    media?: InboundMedia;
}

export interface IncomingMessage {
    platform: string;
    type: MessageType;
    source: MessageSource;
    from: string;
    senderName?: string;
    to: string;
    timestamp: number;
    messageId: string;
    content?: string;
    room?: {id: string};
    quote?: QuoteRef;
    media?: InboundMedia;
    raw: unknown;
}
