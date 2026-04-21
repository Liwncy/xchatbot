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
    /** 错误信息（Swagger 中为 wrapperspb.StringValue，兼容旧字符串格式）。 */
    message?: StringValue | string;
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
    /** Swagger 当前字段名。 */
    data?: number[] | string;
    /** Swagger 当前字段名。 */
    size?: number;
    /** 兼容旧网关字段名。 */
    buffer?: number[] | string;
    /** 兼容旧网关字段名。 */
    len?: number;
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
    /** 表情数据的 MD5 哈希（为空时自动计算）。 */
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
    /** 转发内容类型（image / video / file）。 */
    type: string;
    /** 原始消息 XML。 */
    xml: string;
}

/** POST /api/message/revoke */
export interface RevokeParam {
    /** 接收者 wxid（会话）。 */
    receiver: string;
    /** 客户端消息 ID。 */
    client_id: number;
    /** 服务端消息 ID。 */
    new_id: number;
    /** 原始消息创建时间。 */
    create_time: number;
}

/** POST /api/payment/hongbao/create */
export interface CreateHongBaoParam {
    /** 每个红包金额（单位分，最小 100）。 */
    amount: number;
    /** 红包个数。 */
    count: number;
    /** 红包类型：0=普通红包，1=拼手气红包。 */
    hb_type: number;
    /** 来源：0=群红包，1=个人红包。 */
    in_way: number;
    /** 接收者 wxid 或群 ID。 */
    username: string;
    /** 祝福语。 */
    wishing: string;
}

/** POST /api/payment/hongbao/detail */
export interface QueryHongBaoDetailParam {
    /** 红包原始 URL。 */
    native_url: string;
    /** 发送者用户名。 */
    send_username: string;
}

/** POST /api/payment/hongbao/grab */
export interface GrabHongBaoParam {
    /** 来源：0=群红包，1=个人红包。 */
    in_way: number;
    /** 红包原始 URL。 */
    native_url: string;
}

/** POST /api/payment/hongbao/list */
export interface QueryHongBaoListParam {
    /** 每页数量。 */
    limit: number;
    /** 红包原始 URL。 */
    native_url: string;
    /** 偏移量。 */
    offset: number;
    /** 发送者用户名。 */
    send_username: string;
}

/** POST /api/payment/hongbao/open */
export interface OpenHongBaoParam {
    /** 红包原始 URL。 */
    native_url: string;
    /** 红包发送者用户名。 */
    send_username: string;
    /** 接收红包返回的 timingIdentifier。 */
    timing_identifier: string;
}

/** POST /api/payment/hongbao/receive */
export interface ReceiveHongBaoParam {
    /** 来源：0=群红包，1=个人红包。 */
    in_way: number;
    /** 红包原始 URL。 */
    native_url: string;
}

/** POST /api/payment/transfer/create */
export interface CreatePreTransferParam {
    /** 转账备注。 */
    description: string;
    /** 转账金额（单位分）。 */
    fee: number;
    /** 转账目标用户 wxid。 */
    to_username: string;
}

/** POST /api/payment/transfer/confirm */
export interface ConfirmPreTransferParam {
    /** 付款方式序列号。 */
    bank_serial: string;
    /** 付款方式类型。 */
    bank_type: string;
    /** 支付密码。 */
    pay_password: string;
    /** 创建转账返回的 req_key。 */
    req_key: string;
}

/** POST /api/payment/collect */
export interface CollectMoneyParam {
    /** 失效时间。 */
    invalid_time: string;
    /** 付款方用户名。 */
    to_username: string;
    /** 交易 ID。 */
    transaction_id: string;
    /** 转账 ID。 */
    transfer_id: string;
}

/** POST /api/cdn/download/image */
export interface CdnDownloadImageParam {
    /** CDN 文件 ID（从消息 XML 中获取）。 */
    file_id: string;
    /** hex 编码的 AES 密钥（Swagger 当前字段名）。 */
    file_key?: string;
    /** 兼容旧字段名。 */
    file_aes_key?: string;
}

/** POST /api/cdn/upload/image */
export interface CdnUploadImageParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的图片数据。 */
    image_data: string;
}

/** POST /api/cdn/upload/video */
export interface CdnUploadVideoParam {
    /** 接收者 wxid。 */
    receiver: string;
    /** Base64 编码的视频数据。 */
    video_data: string;
    /** Base64 编码的缩略图数据。 */
    thumb_data: string;
}

/** POST /api/cdn/upload/sns/image */
export interface CdnUploadSnsImageParam {
    /** Base64 编码的图片数据。 */
    image_data: string;
}

/** POST /api/cdn/upload/sns/video */
export interface CdnUploadSnsVideoParam {
    /** Base64 编码的视频数据。 */
    video_data: string;
    /** Base64 编码的缩略图数据。 */
    thumb_data: string;
}

/** POST /api/cdn/download/video 与 /api/cdn/download/video/cover */
export interface CdnDownloadVideoParam {
    /** CDN 文件 ID。 */
    file_id: string;
    /** hex 编码的 AES 密钥（Swagger 当前字段名）。 */
    file_key: string;
}

/** POST /api/cdn/download/sns/video */
export interface CdnDownloadSnsVideoParam {
    /** ISAAC64 解密密钥。 */
    enc_key: number;
    /** 加密视频 URL。 */
    video_url: string;
}

/** POST /api/message/download/file */
export interface DownloadFileParam {
    /** 小程序 / App ID。 */
    app_id?: string;
    /** 附件媒体 ID，从消息 XML 中获取。 */
    attach_id?: string;
    /** 文件总长度（字节）。 */
    size: number;
    /** 本次请求长度。 */
    chunk_size: number;
    /** 起始位置。 */
    offset: number;
    /** 用户名。 */
    username: string;
}

/** POST /api/message/download/image */
export interface DownloadImgParam {
    /** 消息 ID。 */
    id: number;
    /** 新消息 ID。 */
    new_id: number;
    /** 发送者 wxid。 */
    sender: string;
    /** 文件总长度（字节），从消息 XML 中获取。 */
    size: number;
}

/** POST /api/message/download/video */
export interface DownloadVideoParam {
    /** 消息 ID。 */
    id: number;
    /** 新消息 ID。 */
    new_id: number;
    /** 视频总长度（字节）。 */
    size: number;
}

/** POST /api/message/download/voice */
export interface DownloadVoiceParam {
    /** 消息 ID。 */
    id: number;
    /** 新消息 ID。 */
    new_id: number;
    /** Data ID，从消息中获取。 */
    buffer_id: number;
    /** 语音数据长度。 */
    length: number;
    /** 群聊名称（非群聊传空字符串）。 */
    group_id?: string;
}

// ---------------------------------------------------------------------------
// 扩展接口 – 通用类型 / 查询参数 / 请求参数
// ---------------------------------------------------------------------------

/** 通用 JSON 对象。 */
export type JsonObject = Record<string, unknown>;

/** 联系人增量同步查询参数。 */
export interface ContactsSyncQuery {
    contact_seq?: number;
    group_seq?: number;
}

/** 全部联系人分页查询参数。 */
export interface ContactsPageQuery extends ContactsSyncQuery {
    offset?: number;
    limit?: number;
}

/** 收藏同步查询参数。 */
export interface FavorSyncQuery {
    key?: string;
}

/** 朋友圈分页查询参数。 */
export interface MomentsTimelineQuery {
    first_page_md5?: string;
    max_id?: number;
}

/** 用户证书查询参数。 */
export interface UserCertQuery {
    current_version?: number;
}

/** 用户二维码查询参数。 */
export interface UserQrcodeQuery {
    style?: number;
}

/** POST /api/login/password */
export type PasswordLoginRequest = JsonObject;
/** POST /api/contacts/detail */
export type ContactDetailRequest = JsonObject;
/** POST /api/contacts/friend-requests */
export type SendFriendRequest = JsonObject;
/** POST /api/contacts/friend-requests/verify */
export type VerifyFriendRequest = JsonObject;
/** POST /api/contacts/lbs */
export type LbsFindRequest = JsonObject;
/** PUT /api/contacts/remark/{username} */
export type SetRemarkRequest = JsonObject;
/** POST /api/contacts/search */
export type SearchContactRequest = JsonObject;
/** POST /api/contacts/upload */
export type UploadContactRequest = JsonObject;
/** POST /api/groups */
export type CreateGroupRequest = JsonObject;
/** POST/DELETE /api/groups/admins/{group}, /api/groups/members/{group}, /api/groups/invite/{group} */
export type GroupMembersRequest = JsonObject;
/** PUT /api/groups/announcement/{group} */
export type SetAnnouncementRequest = JsonObject;
/** POST /api/groups/facing */
export type FacingCreateRequest = JsonObject;
/** POST /api/groups/join/consent */
export type ConsentJoinRequest = JsonObject;
/** POST /api/groups/join/scan */
export type ScanJoinRequest = JsonObject;
/** PUT /api/contacts/{username}/labels */
export type ModifyContactLabelsRequest = JsonObject;
/** POST /api/labels */
export type AddLabelRequest = JsonObject;
/** PUT /api/labels/{id} */
export type UpdateLabelRequest = JsonObject;
/** POST /api/miniapp/avatar */
export type MiniappAddAvatarRequest = JsonObject;
/** POST /api/miniapp/avatar/upload */
export type MiniappUploadAvatarImgRequest = JsonObject;
/** POST /api/miniapp/cloud/function */
export type MiniappCloudCallFunctionRequest = JsonObject;
/** POST /api/miniapp/login/js */
export type MiniappJSLoginRequest = JsonObject;
/** POST /api/miniapp/login/qrcode */
export type MiniappQrcodeAuthRequest = JsonObject;
/** DELETE /api/miniapp/mobile */
export type MiniappDelMobileRequest = JsonObject;
/** POST /api/miniapp/mobile */
export type MiniappAddMobileRequest = JsonObject;
/** POST /api/miniapp/mobile/check-code */
export type MiniappCheckVerifyCodeRequest = JsonObject;
/** POST /api/miniapp/mobile/send-code */
export type MiniappSendVerifyCodeRequest = JsonObject;
/** POST /api/miniapp/oauth/sdk */
export type OauthSdkAppParam = JsonObject;
/** POST /api/miniapp/oauth/third */
export type ThirdAppGrantParam = JsonObject;
/** POST /api/miniapp/openid */
export type MiniappGetUserOpenIDRequest = JsonObject;
/** POST /api/miniapp/operate */
export type MiniappOperateWxDataRequest = JsonObject;
/** POST /api/miniapp/record */
export type MiniappAddRecordRequest = JsonObject;
/** POST /api/miniapp/session/qrcode */
export type MiniappGetSessionQRCodeRequest = JsonObject;
/** POST /api/miniapp/session/runtime */
export type MiniappGetRuntimeSessionRequest = JsonObject;
/** POST /api/moments */
export type PostParam = JsonObject;
/** POST /api/moments/comment/{id} */
export type CommentParam = JsonObject;
/** PUT /api/moments/privacy */
export type SetMomentsPrivacyParam = JsonObject;
/** PUT /api/user/alias */
export type SetAliasRequest = JsonObject;
/** POST /api/user/email */
export type BindEmailRequest = JsonObject;
/** POST /api/user/mobile */
export type BindMobileRequest = JsonObject;
/** POST /api/user/mobile/verify-code */
export type SendVerifyMobileRequest = JsonObject;
/** POST /api/user/motion */
export type ReportMotionRequest = JsonObject;
/** PUT /api/user/password */
export type SetPasswordRequest = JsonObject;
/** POST /api/user/password/verify */
export type VerifyPasswordRequest = JsonObject;
/** PUT /api/user/privacy */
export type SetPrivacyRequest = JsonObject;
/** PUT /api/user/profile */
export type UpdateProfileRequest = JsonObject;
/** DELETE /api/user/safety/devices */
export type DelSafeDeviceRequest = JsonObject;
/** POST /api/manager/push_url */
export type PushConfig = JsonObject;
/** POST /api/manager/storage/status */
export type StorageConfig = JsonObject;

// ---------------------------------------------------------------------------
// 消息 – 响应类型 (golem_proto_message.*)
// ---------------------------------------------------------------------------

/** SendMessageResponse 中的单条结果条目。 */
export interface SendMessageResult {
    /** 客户端消息 ID。 */
    client_id: number;
    /**
     * 返回码。
     * 0 = 成功，
     * -22 = 消息已发送但被拒绝（被拉黑），
     * -44 = 需要好友验证（已被删除）。
     */
    code: number;
    /** 创建时间戳。 */
    create_time: number;
    /** 消息 ID。 */
    id: number;
    /** 新消息 ID。 */
    new_id: number;
    /** 接收者用户名。 */
    receiver?: StringValue;
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
    base_response: BaseResponse;
    action_flag: number;
    aes_key: string;
    app_id: string;
    client_id: string;
    create_time: number;
    extend_xml: string;
    id: number;
    new_id: number;
    receiver: string;
    sender: string;
    type: number;
}

/** 图片上传的响应。 */
export interface UploadImageResponse {
    base_response: BaseResponse;
    aes_key: string;
    client_id?: StringValue;
    create_time: number;
    chunk_size: number;
    extend_xml: string;
    file_id: string;
    id: number;
    new_id: number;
    offset: number;
    receiver?: StringValue;
    sender?: StringValue;
    size: number;
}

/** 视频上传的响应。 */
export interface UploadVideoResponse {
    base_response: BaseResponse;
    action_flag: number;
    aes_key: string;
    client_id: string;
    extend_xml: string;
    id: number;
    new_id: number;
    thumb_offset: number;
    video_offset: number;
}

/** 语音上传的响应。 */
export interface UploadVoiceResponse {
    base_response: BaseResponse;
    cancel_flag: number;
    client_id: string;
    create_time: number;
    duration: number;
    end_flag: number;
    id: number;
    new_id: number;
    offset: number;
    receiver: string;
    sender: string;
    size: number;
}

/** 单个表情上传结果。 */
export interface UploadEmojiResult {
    /** 返回码。 */
    code: number;
    /** 消息 ID。 */
    id: number;
    md5: string;
    /** 新消息 ID。 */
    new_id: number;
    /** 起始位置。 */
    offset: number;
    /** 总长度。 */
    size: number;
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

/** 红包相关接口响应。 */
export interface HongBaoResponse {
    base_response: BaseResponse;
    /** CGI 命令 ID。 */
    cgi_command?: number;
    /** 平台返回码。 */
    code?: number;
    /** 错误消息。 */
    error_message?: string;
    /** 错误类型。 */
    error_type?: number;
    /** 平台消息。 */
    message?: string;
    /** 返回文本（通常为 JSON 字符串或 buffer）。 */
    text?: BufferValue;
}

/** 支付/转账相关接口响应。 */
export interface TenPayResponse {
    base_response: BaseResponse;
    /** CGI 命令 ID。 */
    cgi_cmd?: number;
    /** 平台返回码。 */
    code?: number;
    /** 支付错误消息。 */
    error_message?: string;
    /** 支付错误类型。 */
    error_type?: number;
    /** 平台消息。 */
    message?: string;
    /** 响应文本。 */
    text?: StringValue;
}


/** 下载文件附件响应。 */
export interface DownloadAppAttachResponse {
    base_response: BaseResponse;
    app_id?: string;
    chunk?: BufferValue;
    chunk_size?: number;
    media_id?: string;
    offset?: number;
    size?: number;
    username?: string;
}

/** 下载图片响应。 */
export interface DownloadImageResponse {
    base_response: BaseResponse;
    chunk?: BufferValue;
    chunk_size?: number;
    id?: number;
    new_id?: number;
    offset?: number;
    receiver?: StringValue;
    sender?: StringValue;
    size?: number;
}

/** 视频下载响应。 */
export interface DownloadVideoResponse {
    base_response: BaseResponse;
    chunk?: BufferValue;
    id?: number;
    new_id?: number;
    offset?: number;
    size?: number;
}

/** 语音下载响应。 */
export interface DownloadVoiceResponse {
    base_response: BaseResponse;
    cancel_flag?: number;
    client_id?: string;
    data?: BufferValue;
    duration?: number;
    end_flag?: number;
    id?: number;
    new_id?: number;
    offset?: number;
    size?: number;
}

/** 同步接口返回的新消息。 */
export interface NewMessage {
    content?: StringValue;
    create_time: number;
    image_buffer?: BufferValue;
    image_status?: number;
    /** 消息 ID。 */
    id: number;
    /** 新消息 ID。 */
    new_id: number;
    /** 消息序列号。 */
    sequence: number;
    /** 消息来源。 */
    source: string;
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
