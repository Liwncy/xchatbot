export type MessageSource = 'private' | 'group' | 'official';

export type MessageType = 'text' | 'image' | 'emoji' | 'voice' | 'video' | 'link' | 'unknown';

export interface QuoteMessageId {
    newId: number;
    newIdText?: string;
    clientId?: number;
    clientIdText?: string;
    createTime: number;
}

export interface QuoteRef {
    title: string;
    referType: number;
    referContent?: string;
    referFrom?: string;
    referSenderName?: string;
    referMessageId?: QuoteMessageId;
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
    raw: unknown;
}
