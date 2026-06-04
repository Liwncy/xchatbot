import type {
    AddChatroomMemberResponse,
    AddLabelRequest,
    ApiResponse,
    ChatroomAdminResponse,
    ChatroomMembersRequest,
    CommentParam,
    ConsentJoinRequest,
    ConsentJoinResult,
    ContactsSyncQuery,
    ContactsSyncResponse,
    CreateChatroomRequest,
    CreateChatroomResponse,
    DeleteChatroomMemberResponse,
    FacingCreateChatroomResponse,
    FacingCreateRequest,
    FavorSyncQuery,
    GetChatroomInfoDetailResponse,
    GetContactResponse,
    GetQRCodeResponse,
    JsonObject,
    LbsFindRequest,
    LbsResponse,
    ListMembersResponse,
    LoginQRCodeResult,
    MiniappAddAvatarRequest,
    MiniappAddMobileRequest,
    MiniappAddRecordRequest,
    MiniappCloudCallFunctionRequest,
    MiniappCheckVerifyCodeRequest,
    MiniappDelMobileRequest,
    MiniappGetRuntimeSessionRequest,
    MiniappGetSessionQRCodeRequest,
    MiniappGetUserOpenIDRequest,
    MiniappJSLoginRequest,
    MiniappOperateWxDataRequest,
    MiniappQrcodeAuthRequest,
    MiniappSendVerifyCodeRequest,
    MiniappUploadAvatarImgRequest,
    ModifyContactLabelsRequest,
    MomentsTimelineQuery,
    OauthSdkAppParam,
    OperateResponse,
    PasswordLoginRequest,
    PasswordLoginResult,
    PostParam,
    ScanJoinRequest,
    ScanJoinResult,
    SearchContactRequest,
    SearchContactResponse,
    SendFriendRequest,
    SetAliasRequest,
    SetChatroomAnnouncementRequest,
    SetChatroomAnnouncementResponse,
    SetMomentsPrivacyParam,
    SetRemarkRequest,
    SyncResult,
    ThirdAppGrantParam,
    UpdateLabelRequest,
    UploadContactRequest,
    UploadMContactResponse,
    UserCertQuery,
    UserQrcodeQuery,
    VerifyFriendRequest,
    VerifyUserResponse,
    WakeupLoginResult,
    BindEmailRequest,
    BindMobileRequest,
    SendVerifyMobileRequest,
    ReportMotionRequest,
    SetPasswordRequest,
    VerifyPasswordRequest,
    SetPrivacyRequest,
    UpdateProfileRequest,
    DelSafeDeviceRequest,
    PushConfig,
    StorageConfig,
    MomentMediaUploadParam,
} from '../api-types.js';
import {WechatMessageApi} from './message.js';

export class WechatSocialApi extends WechatMessageApi {
    /** 访问文档首页（302 跳转）。GET / */
    async getDocsRedirect(): Promise<Response> {
        return this.requestRaw('GET', '/');
    }

    /** 获取 Swagger JSON 文档。GET /doc/json */
    async getSwaggerJson(): Promise<JsonObject> {
        return this.getJson<JsonObject>('/doc/json');
    }

    /** 获取 Swagger YAML 文档。GET /doc/yaml */
    async getSwaggerYaml(): Promise<string> {
        return this.getText('/doc/yaml');
    }

    /** 获取服务健康状态。GET /health */
    async getHealth(): Promise<string> {
        return this.getText('/health');
    }

    /** 开始登录并获取二维码。GET /api/login/login */
    async startLogin(): Promise<ApiResponse<LoginQRCodeResult>> {
        return this.get<LoginQRCodeResult>('/api/login/login');
    }

    /** 账号密码登录。POST /api/login/password */
    async loginWithPassword(params: PasswordLoginRequest): Promise<ApiResponse<PasswordLoginResult>> {
        return this.post<PasswordLoginResult>('/api/login/password', params);
    }

    /** 首次登录初始化。GET /api/login/init */
    async initLogin(): Promise<ApiResponse<SyncResult>> {
        return this.get<SyncResult>('/api/login/init');
    }

    /** 唤醒登录。GET /api/login/awaken */
    async awakenLogin(): Promise<ApiResponse<WakeupLoginResult>> {
        return this.get<WakeupLoginResult>('/api/login/awaken');
    }

    /** 退出登录。GET /api/login/logout */
    async logout(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/login/logout');
    }

    /** 获取登录状态。GET /api/login/status */
    async getLoginStatus(): Promise<ApiResponse<string>> {
        return this.get<string>('/api/login/status');
    }

    /** 获取联系人增量列表。GET /api/contacts */
    async getContacts(params?: ContactsSyncQuery): Promise<ApiResponse<ContactsSyncResponse>> {
        return this.get<ContactsSyncResponse>('/api/contacts', params);
    }

    /** 删除联系人。DELETE /api/contacts/{username} */
    async deleteContact(username: string): Promise<ApiResponse<OperateResponse>> {
        return this.delete<OperateResponse>(this.buildPath('/api/contacts/{username}', {username}));
    }

    /** 加入黑名单。POST /api/contacts/blacklist/{username} */
    async addContactToBlacklist(username: string): Promise<ApiResponse<OperateResponse>> {
        return this.postQuery<OperateResponse>(this.buildPath('/api/contacts/blacklist/{username}', {username}));
    }

    /** 移出黑名单。DELETE /api/contacts/blacklist/{username} */
    async removeContactFromBlacklist(username: string): Promise<ApiResponse<OperateResponse>> {
        return this.delete<OperateResponse>(this.buildPath('/api/contacts/blacklist/{username}', {username}));
    }

    /** 获取联系人详情。POST /api/contacts/detail */
    async getContactDetail(params: string[]): Promise<ApiResponse<GetContactResponse>> {
        return this.post<GetContactResponse>('/api/contacts/detail', params);
    }

    /** 发送好友申请。POST /api/contacts/friend-requests */
    async sendFriendRequest(params: SendFriendRequest): Promise<ApiResponse<VerifyUserResponse>> {
        return this.post<VerifyUserResponse>('/api/contacts/friend-requests', params);
    }

    /** 通过好友验证。POST /api/contacts/friend-requests/verify */
    async verifyFriendRequest(params: VerifyFriendRequest): Promise<ApiResponse<VerifyUserResponse>> {
        return this.post<VerifyUserResponse>('/api/contacts/friend-requests/verify', params);
    }

    /** 搜索附近的人。POST /api/contacts/lbs */
    async findNearbyContacts(params: LbsFindRequest): Promise<ApiResponse<LbsResponse>> {
        return this.post<LbsResponse>('/api/contacts/lbs', params);
    }

    /** 设置联系人备注。PUT /api/contacts/remark/{username} */
    async setContactRemark(username: string, params: SetRemarkRequest): Promise<ApiResponse<OperateResponse>> {
        return this.put<OperateResponse>(this.buildPath('/api/contacts/remark/{username}', {username}), params);
    }

    /** 搜索联系人。POST /api/contacts/search */
    async searchContacts(params: SearchContactRequest): Promise<ApiResponse<SearchContactResponse>> {
        return this.post<SearchContactResponse>('/api/contacts/search', params);
    }

    /** 上传手机联系人。POST /api/contacts/upload */
    async uploadContacts(params: UploadContactRequest): Promise<ApiResponse<UploadMContactResponse>> {
        return this.post<UploadMContactResponse>('/api/contacts/upload', params);
    }

    /** 修改联系人标签。PUT /api/contacts/{username}/labels */
    async updateContactLabels(username: string, params: ModifyContactLabelsRequest): Promise<ApiResponse<OperateResponse>> {
        return this.put<OperateResponse>(this.buildPath('/api/contacts/{username}/labels', {username}), params);
    }

    /** 创建群聊。POST /api/chatroom */
    async createChatroom(params: CreateChatroomRequest): Promise<ApiResponse<CreateChatroomResponse>> {
        return this.post<CreateChatroomResponse>('/api/chatroom', params);
    }

    /** 添加群管理员。POST /api/chatroom/admins/{chatroom} */
    async addChatroomAdmins(chatroom: string, params: ChatroomMembersRequest): Promise<ApiResponse<ChatroomAdminResponse>> {
        return this.post<ChatroomAdminResponse>(this.buildPath('/api/chatroom/admins/{chatroom}', {chatroom}), params);
    }

    /** 移除群管理员。DELETE /api/chatroom/admins/{chatroom} */
    async removeChatroomAdmins(chatroom: string, params: ChatroomMembersRequest): Promise<ApiResponse<ChatroomAdminResponse>> {
        return this.delete<ChatroomAdminResponse>(this.buildPath('/api/chatroom/admins/{chatroom}', {chatroom}), params);
    }

    /** 设置群公告。PUT /api/chatroom/announcement/{chatroom} */
    async setChatroomAnnouncement(chatroom: string, params: SetChatroomAnnouncementRequest): Promise<ApiResponse<SetChatroomAnnouncementResponse>> {
        return this.put<SetChatroomAnnouncementResponse>(this.buildPath('/api/chatroom/announcement/{chatroom}', {chatroom}), params);
    }

    /** 设置群保存到通讯录。PUT /api/chatroom/contact-list/{chatroom} */
    async setChatroomContactList(chatroom: string, save: boolean): Promise<ApiResponse<OperateResponse>> {
        return this.put<OperateResponse>(this.buildPath('/api/chatroom/contact-list/{chatroom}', {chatroom}), undefined, {save});
    }

    /** 面对面建群。POST /api/chatroom/facing */
    async createFacingChatroom(params: FacingCreateRequest): Promise<ApiResponse<FacingCreateChatroomResponse>> {
        return this.post<FacingCreateChatroomResponse>('/api/chatroom/facing', params);
    }

    /** 获取群信息。GET /api/chatroom/info/{chatroom} */
    async getChatroomInfo(chatroom: string): Promise<ApiResponse<GetChatroomInfoDetailResponse>> {
        return this.get<GetChatroomInfoDetailResponse>(this.buildPath('/api/chatroom/info/{chatroom}', {chatroom}));
    }

    /** 邀请成员进群。POST /api/chatroom/invite/{chatroom} */
    async inviteChatroomMembers(chatroom: string, params: ChatroomMembersRequest): Promise<ApiResponse<AddChatroomMemberResponse>> {
        return this.post<AddChatroomMemberResponse>(this.buildPath('/api/chatroom/invite/{chatroom}', {chatroom}), params);
    }

    /** 同意入群。POST /api/chatroom/join/consent */
    async consentJoinChatroom(params: ConsentJoinRequest): Promise<ApiResponse<ConsentJoinResult>> {
        return this.post<ConsentJoinResult>('/api/chatroom/join/consent', params);
    }

    /** 扫码入群。POST /api/chatroom/join/scan */
    async scanJoinChatroom(params: ScanJoinRequest): Promise<ApiResponse<ScanJoinResult>> {
        return this.post<ScanJoinResult>('/api/chatroom/join/scan', params);
    }

    /** 获取群成员列表。GET /api/chatroom/members/{chatroom} */
    async getChatroomMembers(chatroom: string): Promise<ApiResponse<ListMembersResponse>> {
        return this.get<ListMembersResponse>(this.buildPath('/api/chatroom/members/{chatroom}', {chatroom}));
    }

    /** 添加群成员。POST /api/chatroom/members/{chatroom} */
    async addChatroomMembers(chatroom: string, params: ChatroomMembersRequest): Promise<ApiResponse<AddChatroomMemberResponse>> {
        return this.post<AddChatroomMemberResponse>(this.buildPath('/api/chatroom/members/{chatroom}', {chatroom}), params);
    }

    /** 删除群成员。DELETE /api/chatroom/members/{chatroom} */
    async removeChatroomMembers(chatroom: string, params: ChatroomMembersRequest): Promise<ApiResponse<DeleteChatroomMemberResponse>> {
        return this.delete<DeleteChatroomMemberResponse>(this.buildPath('/api/chatroom/members/{chatroom}', {chatroom}), params);
    }

    /** 修改群名称。PUT /api/chatroom/name/{chatroom} */
    async renameChatroom(chatroom: string, name: string): Promise<ApiResponse<OperateResponse>> {
        return this.put<OperateResponse>(this.buildPath('/api/chatroom/name/{chatroom}', {chatroom}), undefined, {name});
    }

    /** 获取群二维码。GET /api/chatroom/qrcode/{chatroom} */
    async getChatroomQrcode(chatroom: string): Promise<ApiResponse<GetQRCodeResponse>> {
        return this.get<GetQRCodeResponse>(this.buildPath('/api/chatroom/qrcode/{chatroom}', {chatroom}));
    }

    /** 退出群聊。DELETE /api/chatroom/quit/{chatroom} */
    async quitChatroom(chatroom: string): Promise<ApiResponse<OperateResponse>> {
        return this.delete<OperateResponse>(this.buildPath('/api/chatroom/quit/{chatroom}', {chatroom}));
    }

    /** 设置群备注。PUT /api/chatroom/remark/{chatroom} */
    async setChatroomRemark(chatroom: string, remark: string): Promise<ApiResponse<OperateResponse>> {
        return this.put<OperateResponse>(this.buildPath('/api/chatroom/remark/{chatroom}', {chatroom}), undefined, {remark});
    }

    /** 转让群主。POST /api/chatroom/transfer/{chatroom} */
    async transferChatroom(chatroom: string, newOwner: string): Promise<ApiResponse<ChatroomAdminResponse>> {
        return this.postQuery<ChatroomAdminResponse>(this.buildPath('/api/chatroom/transfer/{chatroom}', {chatroom}), {new_owner: newOwner});
    }

    /** 获取标签列表。GET /api/labels */
    async getLabels(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/labels');
    }

    /** 创建标签。POST /api/labels */
    async createLabel(params: AddLabelRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/labels', params);
    }

    /** 删除标签。DELETE /api/labels/{id} */
    async deleteLabel(id: string | number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/labels/{id}', {id}));
    }

    /** 更新标签。PUT /api/labels/{id} */
    async updateLabel(id: number, params: UpdateLabelRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/labels/{id}', {id}), params);
    }

    /** 获取收藏概览。GET /api/favor/info */
    async getFavorInfo(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/favor/info');
    }

    /** 删除收藏项。DELETE /api/favor/item/{id} */
    async deleteFavorItem(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/favor/item/{id}', {id}));
    }

    /** 获取收藏项详情。GET /api/favor/item/{id} */
    async getFavorItem(id: number): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/favor/item/{id}', {id}));
    }

    /** 同步收藏。POST /api/favor/sync */
    async syncFavor(params?: FavorSyncQuery): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/favor/sync', params);
    }

    /** 添加小程序头像记录。POST /api/miniapp/avatar */
    async addMiniappAvatar(params: MiniappAddAvatarRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/avatar', params);
    }

    /** 获取随机小程序头像。GET /api/miniapp/avatar/random */
    async getRandomMiniappAvatar(appId: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/avatar/random', {app_id: appId});
    }

    /** 上传小程序头像图片。POST /api/miniapp/avatar/upload */
    async uploadMiniappAvatar(params: MiniappUploadAvatarImgRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/avatar/upload', params);
    }

    /** 调用小程序云函数。POST /api/miniapp/cloud/function */
    async callMiniappCloudFunction(params: MiniappCloudCallFunctionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/cloud/function', params);
    }

    /** 小程序 JS 登录。POST /api/miniapp/login/js */
    async miniappJsLogin(params: MiniappJSLoginRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/login/js', params);
    }

    /** 小程序二维码授权登录。POST /api/miniapp/login/qrcode */
    async miniappQrcodeLogin(params: MiniappQrcodeAuthRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/login/qrcode', params);
    }

    /** 删除小程序绑定手机号。DELETE /api/miniapp/mobile */
    async deleteMiniappMobile(params: MiniappDelMobileRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>('/api/miniapp/mobile', params);
    }

    /** 获取小程序绑定手机号。GET /api/miniapp/mobile */
    async getMiniappMobile(appId: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/mobile', {app_id: appId});
    }

    /** 添加小程序绑定手机号。POST /api/miniapp/mobile */
    async addMiniappMobile(params: MiniappAddMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile', params);
    }

    /** 校验小程序短信验证码。POST /api/miniapp/mobile/check-code */
    async checkMiniappMobileCode(params: MiniappCheckVerifyCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile/check-code', params);
    }

    /** 发送小程序短信验证码。POST /api/miniapp/mobile/send-code */
    async sendMiniappMobileCode(params: MiniappSendVerifyCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile/send-code', params);
    }

    /** 小程序 OAuth SDK 授权。POST /api/miniapp/oauth/sdk */
    async miniappOauthSdk(params: OauthSdkAppParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/oauth/sdk', params);
    }

    /** 小程序第三方授权。POST /api/miniapp/oauth/third */
    async miniappOauthThird(params: ThirdAppGrantParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/oauth/third', params);
    }

    /** 获取小程序 OpenID。POST /api/miniapp/openid */
    async getMiniappOpenId(params: MiniappGetUserOpenIDRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/openid', params);
    }

    /** 操作小程序 wxData。POST /api/miniapp/operate */
    async operateMiniappWxData(params: MiniappOperateWxDataRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/operate', params);
    }

    /** 获取小程序记录。GET /api/miniapp/record */
    async getMiniappRecord(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/record');
    }

    /** 添加小程序记录。POST /api/miniapp/record */
    async addMiniappRecord(params: MiniappAddRecordRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/record', params);
    }

    /** 获取小程序会话二维码。POST /api/miniapp/session/qrcode */
    async getMiniappSessionQrcode(params: MiniappGetSessionQRCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/session/qrcode', params);
    }

    /** 获取小程序运行时会话。POST /api/miniapp/session/runtime */
    async getMiniappRuntimeSession(params: MiniappGetRuntimeSessionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/session/runtime', params);
    }

    /** 发表朋友圈。POST /api/moments */
    async createMoment(params: PostParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/moments', params);
    }

    /** 删除朋友圈。DELETE /api/moments/{id} */
    async deleteMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/{id}', {id}));
    }

    /** 获取朋友圈详情。GET /api/moments/{id} */
    async getMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/moments/{id}', {id}));
    }

    /** 删除朋友圈评论。DELETE /api/moments/comment/{id} */
    async deleteMomentComment(id: number, commentId: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/comment/{id}', {id}), undefined, {comment_id: commentId});
    }

    /** 朋友圈评论。POST /api/moments/comment/{id} */
    async commentMoment(id: number, params: CommentParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>(this.buildPath('/api/moments/comment/{id}', {id}), params);
    }

    /** 取消朋友圈点赞。DELETE /api/moments/like/{id} */
    async unlikeMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/like/{id}', {id}));
    }

    /** 点赞朋友圈。POST /api/moments/like/{id} */
    async likeMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/moments/like/{id}', {id}));
    }

    /** 设置朋友圈隐私。PUT /api/moments/privacy */
    async setMomentsPrivacy(params: SetMomentsPrivacyParam): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/moments/privacy', params);
    }

    /** 同步朋友圈。POST /api/moments/sync */
    async syncMoments(key: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/moments/sync', {key});
    }

    /** 获取朋友圈时间线。GET /api/moments/timeline */
    async getMomentsTimeline(params?: MomentsTimelineQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/moments/timeline', params);
    }

    /** 上传朋友圈媒体文件。POST /api/moments/upload */
    async uploadMomentMedia(params: MomentMediaUploadParam | Blob): Promise<ApiResponse<unknown>> {
        let input: MomentMediaUploadParam;
        if (typeof Blob !== 'undefined' && params instanceof Blob) {
            input = {media: params};
        } else {
            input = params as MomentMediaUploadParam;
        }
        const formData = this.buildMultipartFormData([
            ['media_url', input.media_url],
        ], (data) => {
            this.appendBinaryInput(data, 'media', input.media, 'moment-media.bin', 'application/octet-stream');
        });
        return this.postForm<unknown>('/api/moments/upload', formData);
    }

    /** 获取指定用户朋友圈。GET /api/moments/user/{username} */
    async getUserMoments(username: string, params?: MomentsTimelineQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/moments/user/{username}', {username}), params);
    }

    /** 删除公众号。DELETE /api/official/{appid} */
    async deleteOfficial(appid: string): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/official/{appid}', {appid}));
    }

    /** 关注公众号。POST /api/official/{appid}/follow */
    async followOfficial(appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/official/{appid}/follow', {appid}));
    }

    /** 获取公众号 A8Key。POST /api/official/a8key */
    async getOfficialA8Key(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/a8key', {url});
    }

    /** 公众号文章点赞。POST /api/official/article/like */
    async likeOfficialArticle(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/article/like', {url});
    }

    /** 公众号文章阅读上报。POST /api/official/article/read */
    async readOfficialArticle(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/article/read', {url});
    }

    /** 获取公众号 JSAPI 信息。POST /api/official/jsapi */
    async getOfficialJsapi(url: string, appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/jsapi', {url, appid});
    }

    /** 获取公众号 OAuth 信息。POST /api/official/oauth */
    async getOfficialOauth(url: string, appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/oauth', {url, appid});
    }

    /** 获取支付银行卡列表。GET /api/payment/cards */
    async getPaymentCards(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/payment/cards');
    }

    /** 获取支付收款码。GET /api/payment/qrcode */
    async getPaymentQrcode(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/payment/qrcode');
    }

    /** 设置微信号。PUT /api/user/alias */
    async setUserAlias(params: SetAliasRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/alias', params);
    }

    /** 上传用户头像。POST /api/user/avatar */
    async uploadUserAvatar(file: Blob): Promise<ApiResponse<unknown>> {
        const formData = new FormData();
        formData.set('file', file);
        const res = await this.requestRaw('POST', '/api/user/avatar', {body: formData});
        return this.parseApiResponse<unknown>('/api/user/avatar', res);
    }

    /** 获取用户证书。GET /api/user/cert */
    async getUserCert(params?: UserCertQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/cert', params);
    }

    /** 获取登录设备列表。GET /api/user/devices */
    async getUserDevices(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/devices');
    }

    /** 绑定邮箱。POST /api/user/email */
    async bindUserEmail(params: BindEmailRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/email', params);
    }

    /** 触发邮箱验证。POST /api/user/email/verify */
    async verifyUserEmail(): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/user/email/verify');
    }

    /** 绑定手机号。POST /api/user/mobile */
    async bindUserMobile(params: BindMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/mobile', params);
    }

    /** 发送手机验证码。POST /api/user/mobile/verify-code */
    async sendUserMobileVerifyCode(params: SendVerifyMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/mobile/verify-code', params);
    }

    /** 上报运动数据。POST /api/user/motion */
    async reportUserMotion(params: ReportMotionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/motion', params);
    }

    /** 设置密码。PUT /api/user/password */
    async setUserPassword(params: SetPasswordRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/password', params);
    }

    /** 验证密码。POST /api/user/password/verify */
    async verifyUserPassword(params: VerifyPasswordRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/password/verify', params);
    }

    /** 设置用户隐私。PUT /api/user/privacy */
    async setUserPrivacy(params: SetPrivacyRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/privacy', params);
    }

    /** 获取用户资料。GET /api/user/profile */
    async getUserProfile(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/profile');
    }

    /** 更新用户资料。PUT /api/user/profile */
    async updateUserProfile(params: UpdateProfileRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/profile', params);
    }

    /** 获取用户二维码。GET /api/user/qrcode */
    async getUserQrcode(params?: UserQrcodeQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/qrcode', params);
    }

    /** 删除安全设备。DELETE /api/user/safety/devices */
    async deleteSafeDevice(params: DelSafeDeviceRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>('/api/user/safety/devices', params);
    }

    /** 获取安全设备列表。GET /api/user/safety/devices */
    async getSafeDevices(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/safety/devices');
    }

    /** 获取推送地址配置。GET /api/manager/push_url */
    async getPushUrlConfig(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/manager/push_url');
    }

    /** 设置推送地址配置。POST /api/manager/push_url */
    async setPushUrlConfig(params: PushConfig): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/manager/push_url', params);
    }

    /** 获取存储状态。GET /api/manager/storage/status */
    async getStorageStatus(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/manager/storage/status');
    }

    /** 设置存储状态。POST /api/manager/storage/status */
    async setStorageStatus(params: StorageConfig): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/manager/storage/status', params);
    }
}

