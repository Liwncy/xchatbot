/**
 * Turnstile 模块聚合入口。
 *
 * 对外仅暴露：
 * - 路由入口 `handleTurnstileRequest`
 * - 人机验证会话与链接构造所需的共享模型/工具
 */
export {handleTurnstileRequest} from './handler.js';

export type {HumanVerifySession, HumanVerifyStatus} from './shared.js';
export {
    HUMAN_VERIFY_SESSION_TTL_SECONDS,
    buildExternalVerifyUrl,
    buildTurnstileCheckUrl,
    buildTurnstileLandingUrl,
    createHumanVerifySessionId,
    humanVerifyLatestByUserKey,
    humanVerifySessionKey,
} from './shared.js';

