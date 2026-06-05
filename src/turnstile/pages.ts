import type {HumanVerifySession} from './shared.js';

const TURNSTILE_API_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function htmlResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: {'Content-Type': 'text/html; charset=utf-8'},
    });
}

export function renderPage(title: string, content: string): string {
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

export function renderLandingPage(session: HumanVerifySession): string {
    const checkPath = `/turnstile/check/${encodeURIComponent(session.id)}`;
    return renderPage(
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
}

export function renderCheckPage(session: HumanVerifySession, siteKey: string): string {
    return renderPage(
        '人机验证',
        [
            '<h1>请完成人机验证</h1>',
            `<p>会话ID: ${session.id}</p>`,
            `<form method="POST" action="/turnstile/verify/${encodeURIComponent(session.id)}">`,
            `<div class="cf-turnstile" data-sitekey="${siteKey}"></div>`,
            '<button type="submit">提交验证</button>',
            '</form>',
            '<p class="tip">验证完成后，会自动通知到微信。</p>',
            `<script src="${TURNSTILE_API_SCRIPT_URL}" async defer></script>`,
        ].join(''),
    );
}

export function renderCompletedPage(session: HumanVerifySession): string {
    const doneText = session.status === 'human' ? '验证已通过' : '验证未通过';
    return renderPage('验证结果', `<h1>${doneText}</h1><p>会话ID: ${session.id}</p><p class="tip">你可以返回微信查看结果通知。</p>`);
}

export function renderVerifyResultPage(sessionId: string, success: boolean, errorCodes: string[]): string {
    return success
        ? renderPage('验证通过', `<h1>✅ 验证通过</h1><p>会话ID: ${sessionId}</p><p class="tip">结果已通知到微信。</p>`)
        : renderPage('验证失败', `<h1>❌ 验证未通过</h1><p>会话ID: ${sessionId}</p><p>错误: ${errorCodes.join(', ') || 'unknown'}</p><p class="tip">结果已通知到微信。</p>`);
}

