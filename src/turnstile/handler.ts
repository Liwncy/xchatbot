import type {Env} from '../types/message.js';
import {WechatApi} from '../wechat/api.js';
import {logger} from '../utils/logger.js';
import {
    HUMAN_VERIFY_SESSION_TTL_SECONDS,
    HumanVerifySession,
    humanVerifySessionKey,
} from './shared.js';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function htmlResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: {'Content-Type': 'text/html; charset=utf-8'},
    });
}

function renderPage(title: string, content: string): string {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; margin: 24px; color: #1f2937; }
.card { max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; }
h1 { font-size: 20px; margin-top: 0; }
button { margin-top: 14px; padding: 10px 16px; border: 0; border-radius: 8px; background: #2563eb; color: white; }
.tip { color: #6b7280; font-size: 14px; }
</style>
</head>
<body>
<div class="card">
${content}
</div>
</body>
</html>`;
}

function parseSessionId(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[2] ?? '').trim();
}

async function loadSession(kv: KVNamespace, sessionId: string): Promise<HumanVerifySession | null> {
    const raw = await kv.get(humanVerifySessionKey(sessionId));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as HumanVerifySession;
    } catch {
        return null;
    }
}

async function saveSession(kv: KVNamespace, session: HumanVerifySession): Promise<void> {
    await kv.put(
        humanVerifySessionKey(session.id),
        JSON.stringify(session),
        {expirationTtl: HUMAN_VERIFY_SESSION_TTL_SECONDS},
    );
}

type TurnstileVerifyResponse = {
    success?: boolean;
    'error-codes'?: string[];
};

async function verifyTurnstileToken(secretKey: string, token: string, remoteIp: string): Promise<{success: boolean; errorCodes: string[]}> {
    const form = new URLSearchParams();
    form.set('secret', secretKey);
    form.set('response', token);
    if (remoteIp) form.set('remoteip', remoteIp);

    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: form.toString(),
    });

    const payload = (await response.json()) as TurnstileVerifyResponse;
    return {
        success: Boolean(payload.success),
        errorCodes: payload['error-codes'] ?? [],
    };
}

async function notifyUser(env: Env, session: HumanVerifySession): Promise<void> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) return;

    const api = new WechatApi(apiBaseUrl);
    const baseContent = session.status === 'human'
        ? `✅ 人机验证通过\n会话ID: ${session.id}`
        : `❌ 人机验证未通过\n会话ID: ${session.id}\n错误: ${(session.verifyErrorCodes ?? []).join(', ') || 'unknown'}`;

    const isGroupSource = Boolean(session.roomId?.trim());
    const receiver = isGroupSource ? (session.roomId?.trim() ?? session.requesterId) : session.requesterId;
    const remind = isGroupSource ? session.requesterId : undefined;
    const mentionName = session.requesterName?.trim() || '你';
    const content = isGroupSource ? `@${mentionName}\n${baseContent}` : baseContent;

    try {
        const result = await api.sendText({receiver, content, remind});
        if (typeof result.code === 'number' && result.code !== 0) {
            logger.warn('Turnstile 验证结果通知发送失败', {
                receiver,
                remind,
                code: result.code,
                message: result.message,
            });
        }
    } catch (error) {
        logger.warn('Turnstile 验证结果通知异常', {
            receiver,
            remind,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function handleCheckPage(request: Request, env: Env): Promise<Response> {
    const sessionId = parseSessionId(new URL(request.url).pathname);
    if (!sessionId) return htmlResponse(renderPage('参数错误', '<h1>参数错误</h1><p>缺少会话ID。</p>'), 400);

    const session = await loadSession(env.XBOT_KV, sessionId);
    if (!session) return htmlResponse(renderPage('会话不存在', '<h1>会话不存在</h1><p>该验证会话已过期或不存在。</p>'), 404);

    if (session.status !== 'pending') {
        const doneText = session.status === 'human' ? '验证已通过' : '验证未通过';
        return htmlResponse(renderPage('验证结果', `<h1>${doneText}</h1><p>会话ID: ${session.id}</p><p class="tip">你可以返回微信查看结果通知。</p>`));
    }

    const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? '';
    if (!siteKey) {
        return htmlResponse(renderPage('配置缺失', '<h1>服务配置缺失</h1><p>未配置 TURNSTILE_SITE_KEY。</p>'), 500);
    }

    const html = renderPage(
        '人机验证',
        [
            '<h1>请完成人机验证</h1>',
            `<p>会话ID: ${session.id}</p>`,
            `<form method="POST" action="/turnstile/verify/${encodeURIComponent(session.id)}">`,
            `<div class="cf-turnstile" data-sitekey="${siteKey}"></div>`,
            '<button type="submit">提交验证</button>',
            '</form>',
            '<p class="tip">验证完成后，会自动通知到微信。</p>',
            '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
        ].join(''),
    );
    return htmlResponse(html);
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
    const sessionId = parseSessionId(new URL(request.url).pathname);
    if (!sessionId) return htmlResponse(renderPage('参数错误', '<h1>参数错误</h1><p>缺少会话ID。</p>'), 400);

    const session = await loadSession(env.XBOT_KV, sessionId);
    if (!session) return htmlResponse(renderPage('会话不存在', '<h1>会话不存在</h1><p>该验证会话已过期或不存在。</p>'), 404);

    const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? '';
    if (!secretKey) {
        return htmlResponse(renderPage('配置缺失', '<h1>服务配置缺失</h1><p>未配置 TURNSTILE_SECRET_KEY。</p>'), 500);
    }

    const formData = await request.formData();
    const token = String(formData.get('cf-turnstile-response') ?? '').trim();
    if (!token) {
        return htmlResponse(renderPage('验证失败', '<h1>验证失败</h1><p>未获取到 Turnstile token，请返回重试。</p>'), 400);
    }

    const remoteIp = request.headers.get('CF-Connecting-IP') ?? '';
    const verifyResult = await verifyTurnstileToken(secretKey, token, remoteIp);

    const now = Date.now();
    const updated: HumanVerifySession = {
        ...session,
        status: verifyResult.success ? 'human' : 'bot',
        updatedAt: now,
        verifiedAt: now,
        verifyErrorCodes: verifyResult.success ? [] : verifyResult.errorCodes,
    };

    await saveSession(env.XBOT_KV, updated);
    await notifyUser(env, updated);

    const html = verifyResult.success
        ? renderPage('验证通过', `<h1>✅ 验证通过</h1><p>会话ID: ${updated.id}</p><p class="tip">结果已通知到微信。</p>`)
        : renderPage('验证失败', `<h1>❌ 验证未通过</h1><p>会话ID: ${updated.id}</p><p>错误: ${verifyResult.errorCodes.join(', ') || 'unknown'}</p><p class="tip">结果已通知到微信。</p>`);
    return htmlResponse(html);
}

export async function handleTurnstileRequest(request: Request, env: Env): Promise<Response | null> {
    const {pathname} = new URL(request.url);

    if (pathname.startsWith('/turnstile/check/')) {
        if (request.method !== 'GET') return new Response('Method Not Allowed', {status: 405});
        return handleCheckPage(request, env);
    }

    if (pathname.startsWith('/turnstile/verify/')) {
        if (request.method !== 'POST') return new Response('Method Not Allowed', {status: 405});
        return handleVerify(request, env);
    }

    return null;
}

