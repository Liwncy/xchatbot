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
    type?: string;
    data?: WechatPushItem | null;
}

export interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data?: T;
    /** 发送耗时等排障信息，只写进聊天记录，不参与业务判断。 */
    timing?: Record<string, number | string>;
}

/** 聊天记录 / 笔记条目的媒体资源；用已有 CDN 资源，Golem 不会替你下载转存。 */
export interface RecordMedia {
    aes_key?: string;
    duration?: number;
    encrypt_version?: number;
    file_id?: string;
    file_md5?: string;
    file_size?: number;
    file_type?: number;
    format?: string;
    head256_md5?: string;
    thumb_aes_key?: string;
    thumb_file_type?: number;
    thumb_head256_md5?: string;
    thumb_height?: number;
    thumb_id?: string;
    thumb_md5?: string;
    thumb_size?: number;
    thumb_width?: number;
}

export interface RecordEmoji {
    aes_key?: string;
    encrypt_url?: string;
    extern_md5?: string;
    extern_url?: string;
    game_content?: number;
    game_type?: number;
    height?: number;
    md5?: string;
    show_reward_tips?: number;
    type?: number;
    url?: string;
    width?: number;
}

export interface RecordPosition {
    from_poi_list?: boolean;
    label?: string;
    lat?: number;
    lng?: number;
    name?: string;
    poi_id?: string;
    scale?: number;
}

export interface RecordSource {
    from_user?: string;
    hash_username?: string;
    real_chat_name?: string;
}

export interface RecordItem {
    create_time?: number;
    data_id?: string;
    data_source_id?: string;
    datatype?: number;
    description?: string;
    emoji?: RecordEmoji;
    html_id?: string;
    local_id?: number;
    location?: RecordPosition;
    media?: RecordMedia;
    message_uuid?: string;
    /** 十进制字符串，避免 64 位整数丢精度。 */
    new_msg_id?: string;
    sender?: string;
    source?: RecordSource;
    source_head_url?: string;
    source_name?: string;
    source_time?: string;
    title?: string;
}

export interface SendRecordParams {
    receiver: string;
    items?: RecordItem[];
    title?: string;
    description?: string;
    from_scene?: number;
    is_chat_room?: boolean;
}

export interface SendNoteParams {
    receiver: string;
    items?: RecordItem[];
    title?: string;
    description?: string;
    author?: string;
    editor?: string;
    edit_time?: number;
    /** 已有 HTML 资源；用它时，非文本条目必须带与文档一致的 html_id。 */
    html?: RecordMedia;
}

export interface RevokeParam {
    receiver: string;
    client_id?: number | string;
    new_id: number | string;
    create_time?: number;
}
