export interface WechatValueField {
    value: string;
}

export interface WechatPushItem {
    content?: WechatValueField;
    create_time: number;
    id?: number;
    msg_id?: number;
    source?: string;
    msg_source?: string;
    new_id?: number;
    new_msg_id?: number;
    push_content?: string;
    receiver?: WechatValueField;
    sender?: WechatValueField;
    type: number;
}

export interface WechatPushMessage {
    new_message?: WechatPushItem[] | null;
}

export interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data?: T;
}

export interface RevokeParam {
    receiver: string;
    client_id?: number | string;
    new_id: number | string;
    create_time?: number;
}
