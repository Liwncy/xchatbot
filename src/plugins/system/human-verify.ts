import type {TextMessage} from '../types.js';
import {
    HUMAN_VERIFY_SESSION_TTL_SECONDS,
    HumanVerifySession,
    buildTurnstileCheckUrl,
    createHumanVerifySessionId,
    humanVerifyLatestByUserKey,
    humanVerifySessionKey,
} from '../../turnstile/shared.js';

const TRIGGER_PATTERNS = [/人机验证/i, /我是人类吗/i];
const STATUS_PATTERNS = [/验证结果/i, /人机结果/i, /验证状态/i, /^\/human\s+status$/i, /^\/cm\s+human-status$/i];
const VERIFY_LINK_CARD_TITLE = '请先完成人机验证';
const VERIFY_LINK_CARD_DESC = '点击进入验证页面，完成后会自动通知结果';
const VERIFY_LINK_CARD_PIC = 'https://developers.cloudflare.com/favicon-32x32.png';

function isTriggerCommand(content: string): boolean {
    return TRIGGER_PATTERNS.some((pattern) => pattern.test(content));
}

function isStatusCommand(content: string): boolean {
    return STATUS_PATTERNS.some((pattern) => pattern.test(content));
}

function formatStatus(session: HumanVerifySession): string {
    if (session.status === 'human') {
        const verifiedAt = session.verifiedAt ? new Date(session.verifiedAt).toLocaleString('zh-CN', {hour12: false}) : 'unknown';
        return `✅ 你已通过人机验证\n会话ID: ${session.id}\n验证时间: ${verifiedAt}`;
    }
    if (session.status === 'bot') {
        const reason = (session.verifyErrorCodes ?? []).join(', ') || 'unknown';
        return `❌ 当前会话未通过人机验证\n会话ID: ${session.id}\n错误: ${reason}`;
    }
    return `⏳ 人机验证进行中\n会话ID: ${session.id}\n请点击验证链接完成验证`;
}

async function loadLatestSession(kv: KVNamespace, userId: string): Promise<HumanVerifySession | null> {
    const latestId = (await kv.get(humanVerifyLatestByUserKey(userId)))?.trim() ?? '';
    if (!latestId) return null;
    const raw = await kv.get(humanVerifySessionKey(latestId));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as HumanVerifySession;
    } catch {
        return null;
    }
}

export const humanVerifyPlugin: TextMessage = {
    type: 'text',
    name: 'human-verify',
    description: 'Turnstile 人机验证插件：生成验证链接并可查询验证结果',
    match: (content) => {
        const trimmed = content.trim();
        return isTriggerCommand(trimmed) || isStatusCommand(trimmed);
    },
    handle: async (message, env) => {
        const trimmed = (message.content ?? '').trim();

        if (isStatusCommand(trimmed)) {
            const latest = await loadLatestSession(env.XBOT_KV, message.from);
            if (!latest) {
                return {
                    type: 'text',
                    content: '你还没有发起过人机验证。发送“人机验证”即可开始。',
                };
            }
            return {type: 'text', content: formatStatus(latest)};
        }

        const publicBaseUrl = env.TURNSTILE_BASE_URL?.trim() ?? '';
        if (!publicBaseUrl) {
            return {
                type: 'text',
                content: 'TURNSTILE_BASE_URL 未配置，无法生成验证链接。',
            };
        }

        if (!env.TURNSTILE_SITE_KEY?.trim() || !env.TURNSTILE_SECRET_KEY?.trim()) {
            return {
                type: 'text',
                content: 'Turnstile 未配置完成（缺少 SITE_KEY 或 SECRET_KEY）。',
            };
        }

        const now = Date.now();
        const sessionId = createHumanVerifySessionId();
        const session: HumanVerifySession = {
            id: sessionId,
            requesterId: message.from,
            requesterName: message.senderName?.trim() || message.from,
            roomId: message.room?.id,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        await Promise.all([
            env.XBOT_KV.put(
                humanVerifySessionKey(sessionId),
                JSON.stringify(session),
                {expirationTtl: HUMAN_VERIFY_SESSION_TTL_SECONDS},
            ),
            env.XBOT_KV.put(
                humanVerifyLatestByUserKey(message.from),
                sessionId,
                {expirationTtl: HUMAN_VERIFY_SESSION_TTL_SECONDS},
            ),
        ]);

        const link = buildTurnstileCheckUrl(publicBaseUrl, sessionId);
        return [
            {
                type: 'news',
                articles: [
                    {
                        title: VERIFY_LINK_CARD_TITLE,
                        description: VERIFY_LINK_CARD_DESC,
                        url: link,
                        picUrl: VERIFY_LINK_CARD_PIC,
                    },
                ],
            },
            {
                type: 'text',
                content: [
                    '验证入口（备用链接）：',
                    link,
                    '',
                    '验证完成后你会收到结果通知，也可以发送“验证结果”查询。',
                ].join('\n'),
            },
        ];
    },
};

