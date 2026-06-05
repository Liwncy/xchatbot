import type {Env} from '../types/env.js';
import {
    htmlResponse,
    renderCheckPage,
    renderCompletedPage,
    renderLandingPage,
    renderPage,
    renderVerifyResultPage,
} from './pages.js';
import {notifyUser} from './notifier.js';
import {loadSession, parseLandingSessionId, parseSessionId, saveSession} from './session.js';
import type {HumanVerifySession} from './shared.js';
import {getAllowedOrigin, jsonResponse, verifyTurnstileToken} from './verify.js';

async function handleCheckPage(request: Request, env: Env): Promise<Response> {
    const sessionId = parseSessionId(new URL(request.url).pathname);
    if (!sessionId) return htmlResponse(renderPage('参数错误', '<h1>参数错误</h1><p>缺少会话ID。</p>'), 400);

    const session = await loadSession(env.XBOT_KV, sessionId);
    if (!session) return htmlResponse(renderPage('会话不存在', '<h1>会话不存在</h1><p>该验证会话已过期或不存在。</p>'), 404);

    if (session.status !== 'pending') {
        return htmlResponse(renderCompletedPage(session));
    }

    const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? '';
    if (!siteKey) {
        return htmlResponse(renderPage('配置缺失', '<h1>服务配置缺失</h1><p>未配置 TURNSTILE_SITE_KEY。</p>'), 500);
    }

    return htmlResponse(renderCheckPage(session, siteKey));
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

    return htmlResponse(renderLandingPage(session));
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

    return htmlResponse(renderVerifyResultPage(updated.id, verifyResult.success, verifyResult.errorCodes));
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

