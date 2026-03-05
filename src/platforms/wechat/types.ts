/** Message source type from WeChat personal account bridge */
export type WechatSource = 'private' | 'group' | 'official';

/**
 * WeChat personal account message received from a bridge/gateway service.
 * The bridge (e.g. Wechaty) forwards messages as JSON to this webhook.
 */
export interface WechatPersonalMessage {
  /** Message source: private chat, group chat, or official account push */
  source: WechatSource;
  /** Unique message identifier */
  messageId: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  /** Sender information */
  from: {
    id: string;
    name?: string;
  };
  /** Room/group information (present for group messages) */
  room?: {
    id: string;
    topic?: string;
  };
  /** Bot's own WeChat ID */
  self: string;
  /** Message type: text, image, voice, video, link, location */
  type: string;
  /** Text content (for text messages) */
  content?: string;
  /** Media URL (for image/voice/video messages) */
  mediaUrl?: string;
  /** Location details (for location messages) */
  location?: {
    latitude: number;
    longitude: number;
    label?: string;
  };
  /** Link details (for link messages) */
  link?: {
    title: string;
    description?: string;
    url: string;
  };
}
