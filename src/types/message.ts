
/** 支持的消息平台 */
export type Platform = 'wechat';

/** 标准化消息类型 */
export type MessageType =
    | 'text'
    | 'image'
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
    /** 事件详情（事件消息） */
    event?: {
        type: EventType;
        key?: string;
        ticket?: string;
    };
    /** 原始平台推送数据 */
    raw: unknown;
}

import type {Env} from './env.js';
import type {HandlerResponse} from './reply.js';

/** 处理器函数签名 */
export type MessageHandler = (
    message: IncomingMessage,
    env: Env,
) => Promise<HandlerResponse>;

