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

/** 回复消息类型 */
export type ReplyType = 'text' | 'image' | 'voice' | 'video' | 'news' | 'markdown' | 'card' | 'unknown';

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
    mediaId: string;
}

/** 语音回复 */
export interface VoiceReply extends ReplyBase {
    type: 'voice';
    mediaId: string;
}

/** 视频回复 */
export interface VideoReply extends ReplyBase {
    type: 'video';
    mediaId: string;
    title?: string;
    description?: string;
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
    cardContent: unknown;
}

/** 所有回复类型的联合类型 */
export type ReplyMessage =
    | TextReply
    | ImageReply
    | VoiceReply
    | VideoReply
    | NewsReply
    | MarkdownReply
    | CardReply;

/**
 * 处理器可能返回的结果：单条回复、多条回复或不回复。
 * 返回数组可以对一条消息发送多条回复。
 */
export type HandlerResponse = ReplyMessage | ReplyMessage[] | null;

/** 处理器函数签名 */
export type MessageHandler = (
    message: IncomingMessage,
    env: Env,
) => Promise<HandlerResponse>;

/** Cloudflare Workers 环境变量绑定 */
export interface Env {
    // ── 存储绑定 ──
    /** KV 命名空间（XBOT_KV） */
    XBOT_KV: KVNamespace;
    /** D1 数据库（xbotdata） */
    XBOT_DB: D1Database;

    // ── 调试透传（从 KV 动态读取，无需重新部署） ──
    // KV key: "debug:forward:enabled"  value: "true" | "false"
    // KV key: "debug:forward:url"      value: "https://your-local-tunnel-url"
    // 通过 POST /admin/debug 接口控制

    /** 管理接口鉴权 Token（wrangler secret put ADMIN_TOKEN）。未设置时 /admin/debug 无鉴权保护。 */
    ADMIN_TOKEN?: string;

    // 微信个人号（通过网关/桥接服务）
    WECHAT_TOKEN?: string;
    /** 微信网关 API 基础 URL（如 http://gateway:8080）。 */
    WECHAT_API_BASE_URL?: string;
    // 插件
    COMMON_PLUGINS_MAPPING?: string; // JSON字符串，格式为：{"关键词1":"插件1","关键词2":"插件2"}
    /** 通用插件 JSON 配置数组字符串。 */
    COMMON_PLUGINS_CONFIG?: string;
    /** 通用插件远程配置接口地址（GET）。 */
    COMMON_PLUGINS_CONFIG_URL?: string;
    /**
     * 通用插件配置加载顺序：
     * 1) COMMON_PLUGINS_CONFIG / COMMON_PLUGINS_MAPPING（内联）
     * 2) KV: plugins:common:mapping
     * 3) COMMON_PLUGINS_CONFIG_URL（远程）
     */
    /** 拉取通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_PLUGINS_CLIENT_ID?: string;
    /** KV: plugins:parameterized:mapping（动态参数规则）。 */
    /** 拉取动态通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_DYNAMIC_PLUGINS_CLIENT_ID?: string;
    /** KV: plugins:workflow:mapping（多步骤 workflow 规则）。 */
    /** 拉取 workflow 通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_WORKFLOW_PLUGINS_CLIENT_ID?: string;
    /** 兼容旧变量名：拉取动态通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_ADVANCED_PLUGINS_CLIENT_ID?: string;
    // AI 插件
    /** AI 插件使用的聊天接口 URL。 */
    AI_API_URL?: string;
    /** AI 接口认证用的 Bearer Token（可选）。 */
    AI_API_KEY?: string;
    /** 传给 AI 接口的模型名称（可选）。 */
    AI_MODEL?: string;
    AI_SYSTEM_PROMPT?: string;
}
