export type ChatSessionType = 'group' | 'private';
export type ChatDirection = 'inbound' | 'outbound';
export type ChatActorType = 'member' | 'bot' | 'system';
export type ChatReplyStatus = 'sent' | 'failed';

export interface ChatSessionRef {
    sessionId: string;
    sessionType: ChatSessionType;
}

export interface ChatMessageRecord {
    id: number;
    messageId: string;
    platform: string;
    sessionId: string;
    sessionType: ChatSessionType;
    direction: ChatDirection;
    actorType: ChatActorType;
    senderId: string;
    senderName: string;
    msgType: string;
    contentText: string;
    payloadJson: string;
    charCount: number;
    referMessageId: string | null;
    causedByMessageId: string | null;
    replyIndex: number;
    pluginName: string | null;
    replyStatus: ChatReplyStatus | null;
    createdAt: number;
    ingestedAt: number;
}

export interface RecordOutboundOptions {
    causedByMessageId: string;
    replyIndex?: number;
    replyStatus?: ChatReplyStatus;
    outboundMessageId?: string;
    payload?: Record<string, unknown>;
}

export interface GetRecentMessagesOptions {
    limit?: number;
    excludeMessageId?: string;
    sinceUnix?: number;
    direction?: ChatDirection;
}
