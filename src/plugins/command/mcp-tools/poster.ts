/**
 * `#指令大全` / `#指令海报`：把当前公开口令排成海报，截图后上传。
 * 公网文件大约一天失效，链接在 KV 里只留 23 小时。口令表变了就重新出图。
 */
import {imageReply, textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Env} from '../../../types/env.js';
import {FileUploader} from '../../../utils/file-uploader.js';
import {logger} from '../../../utils/logger.js';
import {PREFIX, VERBS} from './catalog.js';

const KV_KEY = 'poster:command-sheet';
/** 比公网文件的一天短一小时，避免发出去时链接已经失效。 */
const URL_TTL_SECONDS = 23 * 60 * 60;
const DEFAULT_SCREENSHOT_URL = 'https://lwcfworker.dpdns.org/screenshot';

type Section = {title: string; color: string; items: string[]};
type CachedPoster = {url: string; fingerprint: string};

const SECTION_DEFS: Array<{title: string; color: string; verbs: string[]}> = [
    {title: '一、图像', color: '#2f6bff', verbs: ['图像画图', '图像快画', '图像识图', '图像好看', '图像随机']},
    {title: '二、视频', color: '#12a36a', verbs: ['视频制作', '视频查询', '视频解析', '视频好看']},
    {title: '三、语音', color: '#7a5af8', verbs: ['语音朗读', '语音音色', '语音判断']},
    {title: '四、搜索和诗词', color: '#0f9aa8', verbs: ['搜索网页', '搜索热搜', '搜索热点', '搜索话题', '诗词随机', '诗词飞花', '诗词搜索']},
    {title: '五、赛事', color: '#c0392b', verbs: ['赛事赛程', '赛事联赛', '赛事赛况', '车票查询']},
    {title: '六、表情和群友', color: '#e06a2c', verbs: ['表情搜索', '表情取用', '群友花名', '群友转交']},
    {title: '七、单独用', color: '#5b6b7c', verbs: ['现在几点', '人机验证', '验证结果', '免费目录', '指令大全', '指令海报']},
    {title: '八、玩法', color: '#f0a202', verbs: ['修仙游历', '修仙选项', '修仙生剧']},
];

function publicVerbs(): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const route of VERBS) {
        if (route.ownerOnly) continue;
        const name = route.verbs[0];
        if (!name || name.startsWith('规则') || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

export function posterSections(): Section[] {
    const verbs = publicVerbs();
    const used = new Set<string>();
    const sections: Section[] = SECTION_DEFS.map((def) => {
        const items = def.verbs.filter((verb) => verbs.includes(verb));
        for (const verb of items) used.add(verb);
        return {title: def.title, color: def.color, items: items.map((verb) => `#${verb}`)};
    });

    const rest = verbs.filter((verb) => !used.has(verb));
    if (rest.length > 0) {
        sections.push({
            title: '七、其他',
            color: '#5b6b7c',
            items: rest.map((verb) => `#${verb}`),
        });
    }

    const play = sections.find((section) => section.title.startsWith('八、'));
    if (play) {
        // 带开关的玩法（如猫娘）不上公共指令图，免得没开的群看到。
        for (const route of PREFIX) {
            if (route.gate) continue;
            play.items.push(`#${route.prefix}…`);
        }
        play.items.push('#玄学…');
    }
    return sections.filter((section) => section.items.length > 0);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderPosterHtml(sections: Section[]): string {
    const cards = sections.map((section) => `
        <section class="card">
            <div class="hd" style="background:${section.color}">${escapeHtml(section.title)}</div>
            <div class="chips">
                ${section.items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}
            </div>
        </section>`).join('');
    const sample = ['机器人消息指令大全', ...sections.flatMap((section) => [section.title, ...section.items])].join('');
    const font = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500;700&text=${encodeURIComponent(sample)}&display=swap`;
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${font}">
<style>
  body { margin: 0; font-family: "Noto Sans SC", sans-serif; color: #1d2a3a;
    background:
      radial-gradient(circle at 18px 18px, rgba(47,107,255,.12) 1.4px, transparent 1.5px) 0 0 / 26px 26px,
      linear-gradient(#f7fbfe, #e7f2fa); }
  .wrap { width: 740px; margin: 0 auto; padding: 28px 18px 32px; box-sizing: border-box; }
  h1 { margin: 0 0 16px; text-align: center; font-size: 34px; letter-spacing: 1px; }
  .card { background: #fff; border-radius: 18px; padding: 14px; margin: 0 0 12px;
    box-shadow: 0 8px 22px rgba(31, 76, 135, .08); }
  .hd { display: inline-block; color: #fff; border-radius: 10px; padding: 6px 12px; font-size: 16px; font-weight: 700; }
  .chips { margin-top: 10px; }
  .chip { display: inline-block; margin: 4px; padding: 6px 12px; border-radius: 999px;
    background: #f3f7fb; font-size: 15px; font-weight: 500; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>机器人消息指令大全</h1>
    ${cards}
  </div>
</body>
</html>`;
}

async function fingerprint(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function readCache(env: Env, current: string): Promise<string | null> {
    const raw = await env.XBOT_KV.get(KV_KEY, 'json') as CachedPoster | null;
    if (!raw?.url || raw.fingerprint !== current) return null;
    return raw.url;
}

async function screenshot(env: Env, html: string): Promise<ArrayBuffer | null> {
    const token = env.GATEWAY_API_KEY?.trim();
    if (!token) {
        logger.warn('指令图没出成', {error: '缺少 GATEWAY_API_KEY'});
        return null;
    }
    const endpoint = env.SCREENSHOT_URL?.trim() || DEFAULT_SCREENSHOT_URL;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            html,
            width: 780,
            height: 1200,
            fullPage: true,
            waitUntil: 'networkidle0',
        }),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.includes('json')) {
        const detail = (await response.text()).slice(0, 200);
        logger.warn('指令图没出成', {status: response.status, detail});
        return null;
    }
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > 32 ? bytes : null;
}

export async function commandPoster(env: Env): Promise<HandlerResponse> {
    const html = renderPosterHtml(posterSections());
    const current = await fingerprint(html);
    try {
        const cached = await readCache(env, current);
        if (cached) return imageReply(cached);

        const bytes = await screenshot(env, html);
        if (!bytes) return textReply('没出成，再试下');
        const url = await FileUploader.upload(bytes, {
            fileName: `command-sheet-${current}.png`,
            contentType: 'image/png',
        });
        if (!url) return textReply('没出成，再试下');
        const payload: CachedPoster = {url, fingerprint: current};
        await env.XBOT_KV.put(KV_KEY, JSON.stringify(payload), {expirationTtl: URL_TTL_SECONDS});
        return imageReply(url);
    } catch (error) {
        logger.warn('指令图没出成', {
            error: error instanceof Error ? error.message : String(error),
        });
        return textReply('没出成，再试下');
    }
}
