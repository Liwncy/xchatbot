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
.section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #e5e7eb; }
.section h2 { font-size: 15px; margin: 0 0 8px; }
.section p, .section li { font-size: 14px; line-height: 1.65; }
ul { margin: 8px 0 0 18px; padding: 0; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
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

function parseLandingSessionId(url: URL): string {
    return decodeURIComponent((url.searchParams.get('sid') ?? '').trim());
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
        ? `🎉 恭喜，经权威认证 TA 是人类！\n会话ID: ${session.id}`
        : `🤖 很遗憾，TA 未能证明自己是人类。\n会话ID: ${session.id}\n错误: ${(session.verifyErrorCodes ?? []).join(', ') || 'unknown'}`;

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

async function handleLandingPage(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = parseLandingSessionId(url);
    if (!sessionId) {
        return htmlResponse(renderPage('参数错误', '<h1>参数错误</h1><p>缺少 sid 参数，请返回微信重新获取验证链接。</p>'), 400);
    }

    const session = await loadSession(env.XBOT_KV, sessionId);
    if (!session) {
        return htmlResponse(renderPage('会话不存在', '<h1>会话不存在</h1><p>该验证会话已过期或不存在，请返回微信重新发起。</p>'), 404);
    }

    const checkPath = `/turnstile/check/${encodeURIComponent(sessionId)}`;
    const html = renderPage(
        '验证说明',
        [
            '<h1>人机验证说明</h1>',
            '<p>为防止机器人滥用与批量请求，本服务需要在关键操作前进行一次人机验证。</p>',
            `<p class="tip">会话ID: ${session.id}</p>`,
            '<p class="tip">点击下方按钮后进入验证页面，完成后结果会自动回传微信。</p>',
            `<a href="${checkPath}"><button>开始验证</button></a>`,
            '<div class="section">',
            '<h2>验证用途</h2>',
            '<ul>',
            '<li>识别异常自动化请求，减少群聊/私聊接口滥用。</li>',
            '<li>保护机器人服务稳定性，降低恶意刷请求风险。</li>',
            '<li>仅用于判定当前访问行为是否由真人发起。</li>',
            '</ul>',
            '</div>',
            '<div class="section">',
            '<h2>隐私与数据说明</h2>',
            '<ul>',
            '<li>验证由 Cloudflare Turnstile 提供，服务端仅接收验证结果（通过/未通过）。</li>',
            '<li>系统会记录会话ID、验证状态与时间，用于通知与故障排查。</li>',
            '<li>验证会话为短期保存并自动过期，不用于广告或画像用途。</li>',
            '</ul>',
            '</div>',
            '<div class="section">',
            '<h2>访问提醒</h2>',
            '<ul>',
            '<li>请确认当前域名为你信任的机器人验证域名后再继续。</li>',
            '<li>如页面异常，请返回微信重新触发“人机验证”。</li>',
            '<li>验证结束后可在微信发送“验证结果”查询状态。</li>',
            '</ul>',
            '<p class="tip">健康检查：<a href="/health" target="_blank" rel="noopener noreferrer">/health</a></p>',
            '</div>',
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

function jsonResponse(data: unknown, status = 200, corsOrigin?: string): Response {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (corsOrigin) {
        headers['Access-Control-Allow-Origin'] = corsOrigin;
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    return new Response(JSON.stringify(data), {status, headers});
}

function getAllowedOrigin(request: Request, env: Env): string {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.TURNSTILE_CORS_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    // 若未配置，默认允许 GitHub Pages 同名仓库域名；可通过环境变量精确控制
    if (!allowed.length) return origin;
    return allowed.includes(origin) ? origin : '';
}

async function handleApiVerify(request: Request, env: Env): Promise<Response> {
    const corsOrigin = getAllowedOrigin(request, env);

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin || '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (request.method !== 'POST') {
        return jsonResponse({success: false, error: 'Method Not Allowed'}, 405, corsOrigin);
    }

    let body: {token?: string; sessionId?: string};
    try {
        body = await request.json() as {token?: string; sessionId?: string};
    } catch {
        return jsonResponse({success: false, error: '请求体解析失败，需要 JSON 格式。'}, 400, corsOrigin);
    }

    const token = String(body.token ?? '').trim();
    const sessionId = String(body.sessionId ?? '').trim();

    if (!token || !sessionId) {
        return jsonResponse({success: false, error: '缺少 token 或 sessionId 参数。'}, 400, corsOrigin);
    }

    const session = await loadSession(env.XBOT_KV, sessionId);
    if (!session) {
        return jsonResponse({success: false, error: '验证会话不存在或已过期，请返回微信重新发起。'}, 404, corsOrigin);
    }

    if (session.status !== 'pending') {
        return jsonResponse({
            success: session.status === 'human',
            error: session.status === 'human' ? undefined : '该会话已验证未通过。',
            alreadyVerified: true,
        }, 200, corsOrigin);
    }

    const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? '';
    if (!secretKey) {
        return jsonResponse({success: false, error: '服务配置缺失，请联系管理员。'}, 500, corsOrigin);
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

    if (verifyResult.success) {
        return jsonResponse({success: true}, 200, corsOrigin);
    } else {
        return jsonResponse({
            success: false,
            error: `验证未通过（${verifyResult.errorCodes.join(', ') || 'unknown'}），结果已通知到微信。`,
        }, 200, corsOrigin);
    }
}

export async function handleTurnstileRequest(request: Request, env: Env): Promise<Response | null> {
    const {pathname} = new URL(request.url);

    if (pathname === '/turnstile/landing') {
        if (request.method !== 'GET') return new Response('Method Not Allowed', {status: 405});
        return handleLandingPage(request, env);
    }

    if (pathname.startsWith('/turnstile/check/')) {
        if (request.method !== 'GET') return new Response('Method Not Allowed', {status: 405});
        return handleCheckPage(request, env);
    }

    if (pathname.startsWith('/turnstile/verify/')) {
        if (request.method !== 'POST') return new Response('Method Not Allowed', {status: 405});
        return handleVerify(request, env);
    }

    // 供外部页面（如 GitHub Pages）调用的 JSON API
    if (pathname === '/turnstile/api/verify') {
        return handleApiVerify(request, env);
    }

    return null;
}

