/** 微信个人号网关的消息来源类型 */
export type WechatSource = 'private' | 'group' | 'official';

/** 网关多个字段使用的字符串包装器。 */
export interface WechatValueField {
    value: string;
}

/** 网关返回的原始图片缓冲区数据。 */
export interface WechatImageBuffer {
    buffer?: number[];
    len: number;
}

/** 微信推送数据 `new_messages` 中的一条消息条目。 */
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
 * 微信推送数据信封。
 * 消息事件包含在 `new_messages` 中。
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
