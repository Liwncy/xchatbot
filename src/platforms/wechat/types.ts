/** WeChat-specific raw message fields parsed from XML */
export interface WechatXmlMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: string;
  MsgType: string;
  MsgId?: string;
  // Text
  Content?: string;
  // Image / Voice / Video / ShortVideo
  MediaId?: string;
  PicUrl?: string;
  Format?: string;
  ThumbMediaId?: string;
  // Location
  Location_X?: string;
  Location_Y?: string;
  Scale?: string;
  Label?: string;
  // Link
  Title?: string;
  Description?: string;
  Url?: string;
  // Event
  Event?: string;
  EventKey?: string;
  Ticket?: string;
  Latitude?: string;
  Longitude?: string;
  Precision?: string;
}
