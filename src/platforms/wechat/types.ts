/** Message source type from WeChat personal account bridge */
export type WechatSource = 'private' | 'group' | 'official';

/** String wrapper used by several gateway fields. */
export interface WechatValueField {
  value: string;
}

/** Raw image buffer payload from the gateway. */
export interface WechatImageBuffer {
  buffer?: number[];
  len: number;
}

/** One message entry in WeChat push payload `new_messages`. */
export interface WechatPushItem {
  content?: WechatValueField;
  create_time: number;
  image_buffer?: WechatImageBuffer;
  image_status?: number;
  msg_id: number;
  msg_seq?: number;
  msg_source?: string;
  new_msg_id?: number;
  push_content?: string;
  receiver: WechatValueField;
  sender: WechatValueField;
  status?: number;
  type: number;
}

/**
 * WeChat push payload envelope.
 * Message events are carried in `new_messages`.
 */
export interface WechatPushMessage {
  modify_contacts?: unknown;
  delete_contacts?: unknown;
  new_messages?: WechatPushItem[] | null;
  modify_user_infos?: unknown;
  modify_user_images?: unknown;
  user_info_extends?: unknown;
  function_switches?: unknown;
  unknowns?: unknown;
  continue?: boolean;
}
