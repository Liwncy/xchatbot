/** Supported messaging platforms */
export type Platform = 'wechat' | 'feishu' | 'dingtalk';

/** Normalized incoming message types */
export type MessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'video'
  | 'location'
  | 'link'
  | 'event';

/** Message source for personal WeChat messages */
export type MessageSource = 'private' | 'group' | 'official';

/** Event subtypes for event messages */
export type EventType =
  | 'subscribe'
  | 'unsubscribe'
  | 'scan'
  | 'location'
  | 'click'
  | 'view'
  | 'message_read'
  | 'unknown';

/** Normalized incoming message from any platform */
export interface IncomingMessage {
  /** Source platform */
  platform: Platform;
  /** Message type */
  type: MessageType;
  /** Message source: private chat, group chat, or official account push (WeChat personal) */
  source?: MessageSource;
  /** Sender ID (open_id / user_id depending on platform) */
  from: string;
  /** Sender display name */
  senderName?: string;
  /** Receiver ID (bot/app ID) */
  to: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Unique message ID */
  messageId: string;
  /** Text content (for text messages) */
  content?: string;
  /** Media URL or media_id (for image/voice/video messages) */
  mediaId?: string;
  /** Group/room info (for group messages) */
  room?: {
    id: string;
    topic?: string;
  };
  /** Location info (for location messages) */
  location?: {
    latitude: number;
    longitude: number;
    precision?: number;
    label?: string;
  };
  /** Link info (for link messages) */
  link?: {
    title: string;
    description: string;
    url: string;
  };
  /** Event details (for event messages) */
  event?: {
    type: EventType;
    key?: string;
    ticket?: string;
  };
  /** Raw original platform payload */
  raw: unknown;
}

/** Reply message types that can be sent back */
export type ReplyType = 'text' | 'image' | 'voice' | 'video' | 'news' | 'markdown' | 'card';

/** Text reply */
export interface TextReply {
  type: 'text';
  content: string;
}

/** Image reply */
export interface ImageReply {
  type: 'image';
  mediaId: string;
}

/** Voice reply */
export interface VoiceReply {
  type: 'voice';
  mediaId: string;
}

/** Video reply */
export interface VideoReply {
  type: 'video';
  mediaId: string;
  title?: string;
  description?: string;
}

/** News / article reply (supports multiple articles) */
export interface NewsArticle {
  title: string;
  description?: string;
  url?: string;
  picUrl?: string;
}

export interface NewsReply {
  type: 'news';
  articles: NewsArticle[];
}

/** Markdown reply (Feishu / DingTalk) */
export interface MarkdownReply {
  type: 'markdown';
  title?: string;
  content: string;
}

/** Card / interactive message reply */
export interface CardReply {
  type: 'card';
  cardContent: unknown;
}

/** Union of all reply types */
export type ReplyMessage =
  | TextReply
  | ImageReply
  | VoiceReply
  | VideoReply
  | NewsReply
  | MarkdownReply
  | CardReply;

/** Handler function signature */
export type MessageHandler = (
  message: IncomingMessage,
  env: Env,
) => Promise<ReplyMessage | null>;

/** Cloudflare Workers environment bindings */
export interface Env {
  // WeChat Personal Account (via bridge/gateway)
  WECHAT_TOKEN?: string;
  WECHAT_CALLBACK_URL?: string;
  // Feishu
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  FEISHU_ENCRYPT_KEY?: string;
  // DingTalk
  DINGTALK_APP_KEY?: string;
  DINGTALK_APP_SECRET?: string;
}
