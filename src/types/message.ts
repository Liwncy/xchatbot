/** 支持的消息平台 */
export type Platform = 'wechat';

/** 微信 type 47 表情消息解析结果。 */
export interface WechatInboundEmoji {
    md5: string;
    cdnurl: string;
    size?: number;
    width?: number;
    height?: number;
}

/** 标准化消息类型 */
export type MessageType =
    | 'text'
    | 'image'
    | 'emoji'
    | 'voice'
    | 'video'
    | 'location'
    | 'link'
    | 'event';

/** 微信个人号消息来源 */
export type MessageSource = 'private' | 'group' | 'official';

/** 事件消息子类型 */
export type EventType =
    | 'subscribe'
    | 'unsubscribe'
    | 'scan'
    | 'location'
    | 'click'
    | 'view'
    | 'message_read'
    | 'unknown';

/** 标准化后的接收消息 */
export interface IncomingMessage {
    /** 来源平台 */
    platform: Platform;
    /** 消息类型 */
    type: MessageType;
    /** 消息来源：私聊、群聊或公众号推送（微信个人号） */
    source?: MessageSource;
    /** 发送者 ID（open_id / user_id，视平台而定） */
    from: string;
    /** 发送者显示名称 */
    senderName?: string;
    /** 接收者 ID（机器人 / 应用 ID） */
    to: string;
    /** Unix 时间戳（秒） */
    timestamp: number;
    /** 唯一消息 ID */
    messageId: string;
    /** 文本内容（文本消息） */
    content?: string;
    /** 媒体 URL 或 media_id（图片 / 语音 / 视频消息） */
    mediaId?: string;
    /** 表情字段（微信 type 47） */
    emoji?: WechatInboundEmoji;
    /** 群聊信息（群消息时存在） */
    room?: {
        id: string;
        topic?: string;
    };
    /** 位置信息（位置消息） */
    location?: {
        latitude: number;
        longitude: number;
        precision?: number;
        label?: string;
    };
    /** 链接信息（链接消息） */
    link?: {
        title: string;
        description: string;
        url: string;
    };
    /** 微信引用消息（appmsg type 57） */
    quote?: {
        title: string;
        referType: number;
        referContent?: string;
        /** 被引用消息的发送者 wxid（群聊优先取 chatusr） */
        referFrom?: string;
        /** 被引用消息的发送者显示名 */
        referSenderName?: string;
        imageMeta?: {
            fileId: string;
            fileAesKey: string;
        };
        /** 被引用表情（refermsg type 47） */
        emojiMeta?: WechatInboundEmoji;
        /** 被引用消息的微信 ID（用于撤回等操作） */
        referMessageId?: {
            /** 服务端消息 ID（refermsg svrid）。 */
            newId: number;
            /** 客户端消息 ID（refermsg msgid / msgsource，缺省同 newId）。 */
            clientId?: number;
            createTime: number;
        };
    };
    /** 事件详情（事件消息） */
    event?: {
        type: EventType;
        key?: string;
        ticket?: string;
    };
    /** 原始平台推送数据 */
    raw: unknown;
}


