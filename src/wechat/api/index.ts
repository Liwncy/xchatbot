import {WechatSocialApi} from './social.js';

/**
 * 微信 API 目录聚合入口。
 *
 * - `client.ts`：底层请求与 multipart/通用辅助
 * - `message.ts`：消息 / CDN / 下载 / 支付接口
 * - `social.ts`：登录、联系人、群聊、朋友圈、小程序与管理接口
 */
export class WechatApi extends WechatSocialApi {}

export {WechatApiClient} from './client.js';
export {WechatMessageApi} from './message.js';
export {WechatSocialApi} from './social.js';

