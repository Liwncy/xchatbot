import type {Env} from '../types/message.js';

/** 管理接口统一鉴权：校验 Authorization: Bearer <ADMIN_TOKEN>。 */
export function authorizeAdmin(request: Request, env: Env): Response | null {
    const adminToken = env.ADMIN_TOKEN?.trim();
    if (!adminToken) return null;

    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token === adminToken) return null;

    return new Response(JSON.stringify({error: 'Unauthorized'}), {
        status: 401,
        headers: {'Content-Type': 'application/json'},
    });
}

