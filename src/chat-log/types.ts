import type {MessageType} from '../types/message.js';
import type {ReplyType} from '../types/reply.js';
import type {RevokeParam} from '../wechat/api/types.js';

export type ChatSessionType = 'group' | 'private';
export type ChatDirection = 'inbound' | 'outbound';
export type ChatActorType = 'member' | 'bot' | 'system';
export type ChatReplyStatus = 'sent' | 'failed';

export type ChatInboundMsgType = MessageType;
export type ChatOutboundMsgType = ReplyType;
export type ChatMsgType = ChatInboundMsgType | ChatOutboundMsgType;

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
    msgType: ChatMsgType;
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

export interface RecordInboundOptions {
    referMessageId?: string;
}

export interface RecordOutboundOptions {
    causedByMessageId: string;
    replyIndex?: number;
    pluginName?: string;
    replyStatus?: ChatReplyStatus;
    botSenderId?: string;
    botSenderName?: string;
    /** 微信网关返回的撤回参数，写入 payload_json.wechat_revoke。 */
    wechatRevoke?: RevokeParam;
}

export interface GetRecentMessagesOptions {
    limit?: number;
    maxChars?: number;
    excludeMessageId?: string;
}
