import { handleWechat } from './platforms/wechat/index.js';
import { handleFeishu } from './platforms/feishu/index.js';
import { handleDingTalk } from './platforms/dingtalk/index.js';
import type { Env } from './types/message.js';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route to platform-specific handlers based on URL path
    if (pathname === '/webhook/wechat' || pathname.startsWith('/webhook/wechat/')) {
      return handleWechat(request, env);
    }

    if (pathname === '/webhook/feishu' || pathname.startsWith('/webhook/feishu/')) {
      return handleFeishu(request, env);
    }

    if (pathname === '/webhook/dingtalk' || pathname.startsWith('/webhook/dingtalk/')) {
      return handleDingTalk(request, env);
    }

    if (pathname === '/' || pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'xchatbot' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
