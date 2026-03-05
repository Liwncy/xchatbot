/**
 * WeChat API request and response types derived from the Swagger 2.0 specification
 * in _docs/wechat/apidoc.json.
 *
 * These types cover the message-related endpoints used for sending replies
 * as well as shared base types referenced across the API.
 */

// ---------------------------------------------------------------------------
// Shared / base types
// ---------------------------------------------------------------------------

/** Base response embedded in most protobuf-style replies. */
export interface BaseResponse {
  /** Return code. 0 indicates success. */
  code: number;
  /** Error message (may be absent on success). */
  message?: string;
}

/** Generic API response wrapper returned by all endpoints. */
export interface ApiResponse<T = unknown> {
  /** Status code. 0 means success. */
  code: number;
  /** Status message. */
  message: string;
  /** Response payload. */
  data?: T;
}

// ---------------------------------------------------------------------------
// Message – request parameter types (dto.*)
// ---------------------------------------------------------------------------

/** POST /api/message/text */
export interface SendTextParam {
  /** Recipient wxid. */
  receiver: string;
  /** Text content. */
  content: string;
  /** Comma-separated wxids to @mention (group only). */
  remind?: string;
  /** Message sub-type: 1 = text (default), 42 = card, 48 = location. */
  type?: number;
}

/** POST /api/message/image */
export interface SendImageParam {
  /** Recipient wxid. */
  receiver: string;
  /** Base64-encoded image data. */
  data: string;
}

/** POST /api/message/video */
export interface SendVideoParam {
  /** Recipient wxid. */
  receiver: string;
  /** Base64-encoded video data. */
  video_data: string;
  /** Base64-encoded thumbnail data. */
  thumb_data: string;
  /** Video duration in seconds. */
  duration: number;
}

/** POST /api/message/voice */
export interface SendVoiceParam {
  /** Recipient wxid. */
  receiver: string;
  /** Base64-encoded voice data. */
  data: string;
  /** Voice duration in milliseconds. */
  duration: number;
  /** Audio format: 0 = AMR, 1 = SPEEX, 2 = MP3, 3 = WAVE, 4 = SILK. */
  format: number;
}

/** POST /api/message/emoji */
export interface SendEmojiParam {
  /** Recipient wxid. */
  receiver: string;
  /** Base64-encoded emoji / GIF data. */
  data: string;
  /** MD5 hash of the emoji data (optional). */
  md5?: string;
}

/** POST /api/message/card */
export interface SendCardParam {
  /** Recipient wxid. */
  receiver: string;
  /** Business card wxid. */
  card_username: string;
  /** Business card nickname. */
  card_nickname: string;
  /** Business card alias (WeChat ID). */
  card_alias: string;
}

/** POST /api/message/link */
export interface SendLinkParam {
  /** Recipient wxid. */
  receiver: string;
  /** Link URL. */
  url: string;
  /** Link title. */
  title: string;
  /** Link description. */
  desc: string;
  /** Thumbnail URL. */
  thumb_url: string;
}

/** POST /api/message/position */
export interface SendPositionParam {
  /** Recipient wxid. */
  receiver: string;
  /** Latitude. */
  lat: number;
  /** Longitude. */
  lon: number;
  /** Address label. */
  label: string;
  /** POI name. */
  poi_name: string;
  /** Map scale / zoom level. */
  scale: number;
}

/** POST /api/message/app */
export interface SendAppParam {
  /** Recipient wxid. */
  receiver: string;
  /** App message type. */
  type: number;
  /** XML content of the app message. */
  xml: string;
}

/** POST /api/message/forward */
export interface ForwardParam {
  /** Recipient wxid. */
  receiver: string;
  /** Forwarded content type (image / video / file). */
  type: string;
  /** Original message XML. */
  xml: string;
}

/** POST /api/message/revoke */
export interface RevokeParam {
  /** Recipient wxid (conversation). */
  receiver: string;
  /** Client message ID of the message to revoke. */
  client_msg_id: number;
  /** Server message ID. */
  new_msg_id: number;
  /** Original message creation time. */
  create_time: number;
}

// ---------------------------------------------------------------------------
// Message – response types (messagepb.*)
// ---------------------------------------------------------------------------

/** Individual result entry in SendMessageResponse. */
export interface SendMessageResult {
  /** Client message ID. */
  client_msg_id: number;
  /**
   * Return code.
   * 0 = success,
   * -22 = message sent but rejected (blocked),
   * -44 = friend verification required (deleted).
   */
  code: number;
  /** Creation timestamp. */
  create_time: number;
  /** Server message ID. */
  msg_id: number;
  /** New message ID. */
  new_msg_id: number;
  /** Receiver username. */
  receiver?: string;
  /** Server timestamp. */
  server_time: number;
  /** Message type. */
  type: number;
}

/** Response for text / card / position messages. */
export interface SendMessageResponse {
  base_response: BaseResponse;
  count: number;
  list: SendMessageResult[];
  unknown?: number;
}

/** Response for link / app / forward messages. */
export interface SendAppMessageResponse {
  BaseResponse: BaseResponse;
  action_flag: number;
  aes_key: string;
  app_id: string;
  client_msg_id: string;
  create_time: number;
  msg_id: number;
  msg_source: string;
  new_msg_id: number;
  receiver: string;
  sender: string;
  type: number;
}

/** Response for image uploads. */
export interface UploadImageResponse {
  base_response: BaseResponse;
  aes_key: string;
  client_img_id?: string;
  create_time: number;
  data_len: number;
  file_id: string;
  msg_id: number;
  msg_source: string;
  new_msg_id: number;
  receiver?: string;
  sender?: string;
  start_pos: number;
  total_len: number;
}

/** Response for video uploads. */
export interface UploadVideoResponse {
  base_response: BaseResponse;
  action_flag: number;
  aes_key: string;
  client_msg_id: string;
  msg_id: number;
  msg_source: string;
  new_msg_id: number;
  thumb_start_pos: number;
  video_start_pos: number;
}

/** Response for voice uploads. */
export interface UploadVoiceResponse {
  base_response: BaseResponse;
  cancel_flag: number;
  client_msg_id: string;
  create_time: number;
  duration: number;
  end_flag: number;
  length: number;
  msg_id: number;
  new_msg_id: number;
  offset: number;
  receiver: string;
  sender: string;
}

/** Individual emoji upload result. */
export interface UploadEmojiResult {
  md5: string;
  msg_id: number;
  new_msg_id: number;
  ret: number;
  start_pos: number;
  total_len: number;
}

/** Response for emoji uploads. */
export interface UploadEmojiResponse {
  base_response: BaseResponse;
  action_flag: number;
  count: number;
  result: UploadEmojiResult[];
}

/** Response for message revocation. */
export interface RevokeMessageResponse {
  base_response: BaseResponse;
  /** Introduction text. */
  introduction: string;
  /** System wording shown to participants. */
  sys_wording: string;
}

/** A new message returned by the sync endpoint. */
export interface NewMessage {
  content?: string;
  create_time: number;
  image_status?: number;
  msg_id: number;
  msg_seq: number;
  msg_source: string;
  new_msg_id: number;
  push_content: string;
  receiver?: string;
  sender?: string;
  status: number;
  type: number;
}

/** Result of the message sync endpoint. */
export interface SyncResult {
  /** Whether the client should continue syncing. */
  continue: boolean;
  /** Newly received messages. */
  new_messages: NewMessage[];
}
