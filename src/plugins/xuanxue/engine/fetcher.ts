/** HTTP 请求器：根据规则 + 参数 fetch 页面 */

import {renderTemplateString} from '../../common/shared.js';
import type {XuanxueRule} from '../types.js';

const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchPage(rule: XuanxueRule, params: Record<string, string>): Promise<string> {
    const method = rule.method ?? 'GET';
    const url = renderTemplateString(rule.url, params, true);
    const headers = rule.headers
        ? Object.fromEntries(
            Object.entries(rule.headers).map(([k, v]) => [k, renderTemplateString(v, params, false)]),
        )
        : undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: method === 'POST' && rule.body ? renderTemplateString(rule.body, params, false) : undefined,
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = (await response.text()).slice(0, 500);
            throw new Error(`请求失败 status=${response.status} body=${body}`);
        }

        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

