/**
 * 微信 API 请求和响应类型，基于 _docs/wechat/swagger.json 中的 Swagger 2.0 规范。
 *
 * 这些类型覆盖发送消息与常用消息下载接口，以及 API 中引用的共享基础类型。
 */

// ---------------------------------------------------------------------------
// 共享 / 基础类型
// ---------------------------------------------------------------------------

/** 大多数 protobuf 风格回复中嵌入的基础响应。 */
export interface BaseResponse {
    /** 返回码。0 表示成功。 */
    code: number;
    /** 错误信息（成功时可能不存在）。 */
    message?: string;
}

/** 所有接口返回的通用 API 响应包装器。 */
export interface ApiResponse<T = unknown> {
    /** 状态码。0 表示成功。 */
    code: number;
    /** 状态信息。 */
    message: string;
    /** 响应数据。 */
    data?: T;
}

/** protobuf 的 string wrapper。 */
export interface StringValue {
    value?: string;
}

/** protobuf 的二进制 buffer wrapper。 */
export interface BufferValue {
    buffer?: number[];
    len: number;
}

// ---------------------------------------------------------------------------
// 消息 – 请求参数类型 (dto.*)
// ---------------------------------------------------------------------------

/** POST /api/message/text */
export interface SendTextParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 文本内容。 */
    content: string;
    /** 需要 @提及的 wxid（逗号分隔，仅群聊有效）。 */
    remind?: string;
    /** 消息子类型：1 = 文本（默认），42 = 名片，48 = 位置。 */
    type?: number;
}

/** POST /api/message/image */
export interface SendImageParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的图片数据。 */
    data: string;
}

/** POST /api/message/video */
export interface SendVideoParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的视频数据。 */
    video_data: string;
    /** Base64 编码的缩略图数据。 */
    thumb_data: string;
    /** 视频时长（秒）。 */
    duration: number;
}

/** POST /api/message/voice */
export interface SendVoiceParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的语音数据。 */
    data: string;
    /** 语音时长（毫秒）。 */
    duration: number;
    /** 音频格式：0 = AMR，1 = SPEEX，2 = MP3，3 = WAVE，4 = SILK。 */
    format: number;
}

/** POST /api/message/emoji */
export interface SendEmojiParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的表情 / GIF 数据。 */
    data: string;
    /** 表情数据的 MD5 哈希（可选）。 */
    md5?: string;
}

/** POST /api/message/card */
export interface SendCardParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 名片 wxid。 */
    card_username: string;
    /** 名片昵称。 */
    card_nickname: string;
    /** 名片别名（微信号）。 */
    card_alias: string;
}

/** POST /api/message/link */
export interface SendLinkParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 链接 URL。 */
    url: string;
    /** 链接标题。 */
    title: string;
    /** 链接描述。 */
    desc: string;
    /** 缩略图 URL。 */
    thumb_url: string;
}

/** POST /api/message/position */
export interface SendPositionParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 纬度。 */
    lat: number;
    /** 经度。 */
    lon: number;
    /** 地址标签。 */
    label: string;
    /** POI 名称。 */
    poi_name: string;
    /** 地图缩放级别。 */
    scale: number;
}

/** POST /api/message/app */
export interface SendAppParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 应用消息类型。 */
    type: number;
    /** 应用消息的 XML 内容。 */
    xml: string;
}

/** POST /api/message/forward */
export interface ForwardParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** 转发内容类型（图片 / 视频 / 文件）。 */
    type: string;
    /** 原始消息 XML。 */
    xml: string;
}

/** POST /api/message/revoke */
export interface RevokeParam {
    /** 接收者 wxid（会话）。 */
    receiver: string;
    /** 要撤回的消息的客户端消息 ID。 */
    client_msg_id: number;
    /** 服务端消息 ID。 */
    new_msg_id: number;
    /** 原始消息创建时间。 */
    create_time: number;
}

/** POST /api/message/cdn/image */
export interface CdnDownloadImageParam {
    /** CDN 文件 ID（从消息 XML 中获取）。 */
    file_id: string;
    /** hex 编码的 AES 密钥（从消息 XML 中获取）。 */
    file_aes_key: string;
}

/** POST /api/message/download/file */
export interface DownloadFileParam {
    app_id: string;
    attach_id: string;
    total_len: number;
    data_len: number;
    start_pos: number;
    username: string;
}

/** POST /api/message/download/image */
export interface DownloadImgParam {
    msg_id: number;
    sender: string;
    receiver: string;
    total_len: number;
    data_len: number;
    start_pos: number;
    compress_type: number;
}

/** POST /api/message/download/video */
export interface DownloadVideoParam {
    msg_id: number;
    total_len: number;
    start_pos: number;
    mx_pack_size: number;
}

/** POST /api/message/download/voice */
export interface DownloadVoiceParam {
    msg_id: number;
    buffer_id_str: string;
    length: number;
    group_name: string;
}

// ---------------------------------------------------------------------------
// 消息 – 响应类型 (messagepb.*)
// ---------------------------------------------------------------------------

/** SendMessageResponse 中的单条结果条目。 */
export interface SendMessageResult {
    /** 客户端消息 ID。 */
    client_msg_id: number;
    /**
     * 返回码。
     * 0 = 成功，
     * -22 = 消息已发送但被拒绝（被拉黑），
     * -44 = 需要好友验证（已被删除）。
     */
    code: number;
    /** 创建时间戳。 */
    create_time: number;
    /** 服务端消息 ID。 */
    msg_id: number;
    /** 新消息 ID。 */
    new_msg_id: number;
    /** 接收者用户名。 */
    receiver?: string;
    /** 服务端时间戳。 */
    server_time: number;
    /** 消息类型。 */
    type: number;
}

/** 文本 / 名片 / 位置消息的响应。 */
export interface SendMessageResponse {
    base_response: BaseResponse;
    count: number;
    list: SendMessageResult[];
    unknown?: number;
}

/** 链接 / 应用 / 转发消息的响应。 */
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

/** 图片上传的响应。 */
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

/** 视频上传的响应。 */
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

/** 语音上传的响应。 */
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

/** 单个表情上传结果。 */
export interface UploadEmojiResult {
    md5: string;
    msg_id: number;
    new_msg_id: number;
    ret: number;
    start_pos: number;
    total_len: number;
}

/** 表情上传的响应。 */
export interface UploadEmojiResponse {
    base_response: BaseResponse;
    action_flag: number;
    count: number;
    result: UploadEmojiResult[];
}

/** 消息撤回的响应。 */
export interface RevokeMessageResponse {
    base_response: BaseResponse;
    /** 介绍文本。 */
    introduction: string;
    /** 展示给参与者的系统提示文字。 */
    sys_wording: string;
}

/** CDN DNS 单个 IP 条目。 */
export interface CdnIpInfo {
    ip?: string;
}

/** CDN DNS 信息。 */
export interface CdnDnsInfo {
    auth_key?: BufferValue;
    uin?: number;
    zone_ip_list?: CdnIpInfo[];
}

/** 获取 CDN DNS 的响应。 */
export interface GetCdnDnsResponse {
    base_response: BaseResponse;
    fake_dns_info?: CdnDnsInfo;
}

/** 下载文件附件响应。 */
export interface DownloadAppAttachResponse {
    base_response: BaseResponse;
    app_id?: string;
    attach_id?: string;
    data?: BufferValue;
    data_len?: number;
    start_pos?: number;
    total_len?: number;
}

/** 下载图片响应。 */
export interface GetMsgImgResponse {
    base_response: BaseResponse;
    data?: BufferValue;
    data_len?: number;
    start_pos?: number;
}

/** 视频下载响应。 */
export interface DownloadVideoResponse {
    base_response: BaseResponse;
    data?: BufferValue;
    data_len?: number;
    msg_id?: number;
    start_pos?: number;
    total_len?: number;
}

/** 语音下载响应。 */
export interface DownloadVoiceResponse {
    base_response: BaseResponse;
    cancel_flag?: number;
    client_msg_id?: string;
    data?: StringValue;
    duration?: number;
    end_flag?: number;
    length?: number;
    msg_id?: number;
    new_msg_id?: number;
    offset?: number;
}

/** 同步接口返回的新消息。 */
export interface NewMessage {
    content?: StringValue;
    create_time: number;
    image_buffer?: BufferValue;
    image_status?: number;
    msg_id: number;
    msg_seq: number;
    msg_source: string;
    new_msg_id: number;
    push_content: string;
    receiver?: StringValue;
    sender?: StringValue;
    status: number;
    type: number;
}

/** 消息同步接口的结果。 */
export interface SyncResult {
    /** 客户端是否应继续同步。 */
    continue: boolean;
    /** 新接收到的消息。 */
    new_messages: NewMessage[];
    modify_contacts?: unknown[];
    delete_contacts?: unknown[];
    modify_user_infos?: unknown[];
    modify_user_images?: unknown[];
    user_info_extends?: unknown[];
    function_switches?: unknown[];
    unknowns?: number[];
}
