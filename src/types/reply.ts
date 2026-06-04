/** 回复消息类型 */
export type ReplyType = 'text' | 'image' | 'voice' | 'video' | 'news' | 'markdown' | 'card' | 'app' | 'unknown';

/**
 * 所有回复类型共享的可选字段。
 *
 * - `to` 覆盖默认接收者（默认为原始发送者，群消息时为群会话）。
 * - `mentions` 列出需要 @提及的用户 ID（仅在群聊中生效）。
 */
export interface ReplyBase {
    /** 覆盖默认接收者。省略时回复原始发送者/群。 */
    to?: string;
    /** 群聊回复中需要 @提及的用户 ID 列表。 */
    mentions?: string[];
}

/** 文本回复 */
export interface TextReply extends ReplyBase {
    type: 'text';
    content: string;
}

/** 图片回复 */
export interface ImageReply extends ReplyBase {
    type: 'image';
    /** 图片 URL 或 base64 媒体内容。 */
    mediaId: string;
    /** 图片原始链接，可用于微信网关直接传 `image_url`。 */
    originalUrl?: string;
}

/** 语音回复 */
export interface VoiceReply extends ReplyBase {
    type: 'voice';
    /** 语音 URL 或 base64 媒体内容。 */
    mediaId: string;
    /** 语音时长（毫秒）。 */
    duration?: number;
    /** 音频格式：0=AMR,1=SPEEX,2=MP3,3=WAVE,4=SILK。 */
    format?: number;
    /** 语音原始链接（发送失败时可用于降级提示）。 */
    originalUrl?: string;
    /** 语音发送失败时降级文案。 */
    fallbackText?: string;
}

/** 视频回复 */
export interface VideoReply extends ReplyBase {
    type: 'video';
    /** 视频 URL 或 base64 媒体内容。 */
    mediaId: string;
    title?: string;
    description?: string;
    /** 视频封面图 base64，省略时使用默认封面。 */
    thumbData?: string;
    /** 视频封面图 URL，可用于直传 `thumb_url`，也可在失败时降级为链接卡片封面。 */
    linkPicUrl?: string;
    /** 视频时长（秒），省略时使用默认时长。 */
    duration?: number;
    /** 视频原始链接，可用于发送失败时降级为链接消息。 */
    originalUrl?: string;
}

/** 图文回复（支持多篇文章） */
export interface NewsArticle {
    title: string;
    description?: string;
    url?: string;
    picUrl?: string;
}

export interface NewsReply extends ReplyBase {
    type: 'news';
    articles: NewsArticle[];
}

/** Markdown 回复 */
export interface MarkdownReply extends ReplyBase {
    type: 'markdown';
    title?: string;
    content: string;
}

/** 卡片 / 交互式消息回复 */
export interface CardReply extends ReplyBase {
    type: 'card';
    cardContent: {
        card_username: string;
        card_nickname: string;
        card_alias: string;
    };
}

/** 微信 app 消息（富 XML）。 */
export interface AppReply extends ReplyBase {
    type: 'app';
    appType: number;
    appXml: string;
}

/** 所有回复类型的联合类型 */
export type ReplyMessage =
    | TextReply
    | ImageReply
    | VoiceReply
    | VideoReply
    | NewsReply
    | MarkdownReply
    | CardReply
    | AppReply;

/**
 * 处理器可能返回的结果：单条回复、多条回复或不回复。
 * 返回数组可以对一条消息发送多条回复。
 */
export type HandlerResponse = ReplyMessage | ReplyMessage[] | null;

