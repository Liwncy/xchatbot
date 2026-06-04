import {WechatSocialApi} from './api/social.js';

/**
 * 微信 API 客户端兼容出口。
 *
 * 真实实现已拆分到：
 * - `./api/client.ts`：底层请求、multipart、base64 与通用辅助
 * - `./api/message.ts`：消息 / CDN / 下载 / 支付相关接口
 * - `./api/social.ts`：登录、联系人、群聊、朋友圈、小程序、用户与管理接口
 */
export class WechatApi extends WechatSocialApi {}
