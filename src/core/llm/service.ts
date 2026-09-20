import type {Env} from '../../types/env.js';
import {
    deleteLlmConfig,
    getDefaultLlmConfig,
    getLlmConfig,
    listLlmConfigs,
    setDefaultLlmConfig,
    setLlmConfigStatus,
    upsertLlmConfig,
} from './repository.js';
import {normalizeLlmType, parseLlmType, type LlmConfig, type LlmType} from './types.js';

const HELP = [
    '看已有的：#模型',
    '加一套：#模型 加 名字 地址 模型 钥匙',
    '同类型已有在用的，可只写：#模型 加 名字 钥匙',
    '指定用途：#模型 加 名字 类型 embedding 地址 模型 钥匙',
    '类型：chat / embedding / rerank / image / speech',
    '换着用：#模型 用 名字',
    '停用：#模型 停 名字',
    '再用：#模型 开 名字',
    '改钥匙：#模型 改 名字 钥匙 新的',
    '删掉：#模型 删 名字',
].join('\n');

function normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/gu, '');
}

function maskKey(key: string): string {
    const trimmed = key.trim();
    if (trimmed.length <= 4) return trimmed;
    return `…${trimmed.slice(-4)}`;
}

function formatConfig(item: LlmConfig, showKey: boolean): string {
    const mark = item.status === 'disabled' ? '（停了）' : item.isDefault ? '（在用）' : '';
    const key = showKey ? item.apiKey : maskKey(item.apiKey);
    return `${item.name}${mark}\n类型 ${item.type}\n状态 ${item.status}\n模型 ${item.model}\n地址 ${item.apiUrl}\n钥匙 ${key}`;
}

function takeType(tokens: string[]): {type: LlmType; rest: string[]} {
    const leftover: string[] = [];
    let type: LlmType = 'chat';
    for (let i = 0; i < tokens.length; i += 1) {
        const raw = tokens[i] ?? '';
        const [key, inline] = raw.split('=', 2);
        if (key === '类型' || key === 'type') {
            type = normalizeLlmType(inline || tokens[i + 1]);
            if (!inline) i += 1;
            continue;
        }
        const parsed = parseLlmType(raw);
        if (parsed && leftover.length === 0) {
            type = parsed;
            continue;
        }
        leftover.push(raw);
    }
    return {type, rest: leftover};
}

function parseAdd(tokens: string[]): {
    name: string;
    type: LlmType;
    apiUrl?: string;
    apiKey: string;
    model?: string;
} | string {
    const name = normalizeName(tokens[0] ?? '');
    if (!name) return '名字写后面';
    const {type, rest} = takeType(tokens.slice(1));
    if (!rest.length) return '钥匙写后面';
    const apiUrl = rest.find((item) => /^https?:\/\//iu.test(item));
    const apiKey = rest.find((item) => (
        item !== apiUrl && (item.includes(':') || /^sk-/iu.test(item))
    )) || rest.filter((item) => item !== apiUrl).at(-1) || '';
    if (!apiKey.trim()) return '钥匙写后面';
    const model = rest.find((item) => item !== apiUrl && item !== apiKey);
    return {name, type, apiUrl, apiKey: apiKey.trim(), model};
}

function parsePatch(tokens: string[]): {
    type?: LlmType;
    apiUrl?: string;
    apiKey?: string;
    model?: string;
} | string {
    if (!tokens.length) return '要改的写后面，比如 钥匙 新的';
    const patch: {type?: LlmType; apiUrl?: string; apiKey?: string; model?: string} = {};
    for (let i = 0; i < tokens.length; i += 1) {
        const raw = tokens[i]?.trim() ?? '';
        const next = tokens[i + 1]?.trim() ?? '';
        const [key, inline] = raw.split('=', 2);
        const field = (inline ? key : raw).replace(/：$/, '');
        const value = inline || next;
        if (!value) continue;
        if (field === '钥匙' || field === 'key' || field === 'apikey') {
            patch.apiKey = value;
            if (!inline) i += 1;
            continue;
        }
        if (field === '模型' || field === 'model') {
            patch.model = value;
            if (!inline) i += 1;
            continue;
        }
        if (field === '地址' || field === 'url') {
            patch.apiUrl = value;
            if (!inline) i += 1;
            continue;
        }
        if (field === '类型' || field === 'type') {
            patch.type = normalizeLlmType(value);
            if (!inline) i += 1;
            continue;
        }
        const typed = parseLlmType(raw);
        if (typed && !patch.type) {
            patch.type = typed;
            continue;
        }
        if (/^https?:\/\//iu.test(raw)) patch.apiUrl = raw;
        else if (raw.includes('/') && !patch.model) patch.model = raw;
        else if (!patch.apiKey) patch.apiKey = raw;
    }
    if (!patch.apiUrl && !patch.apiKey && !patch.model && !patch.type) {
        return '要改的写后面，比如 钥匙 新的';
    }
    return patch;
}

export async function runLlmConfig(env: Env, tail: string): Promise<{message: string}> {
    const text = tail.trim();
    if (text === '帮助' || text === '怎么用') return {message: HELP};

    const tokens = text.split(/\s+/u).filter(Boolean);
    const action = tokens[0] ?? '';
    const rest = tokens.slice(1);

    if (action === '加' || action === '存') {
        const parsed = parseAdd(rest);
        if (typeof parsed === 'string') return {message: parsed};
        const inherit = await getDefaultLlmConfig(env, parsed.type);
        const apiUrl = parsed.apiUrl || inherit?.apiUrl;
        const model = parsed.model || inherit?.model;
        if (!apiUrl || !model) {
            return {message: '地址和模型名也写上，比如 #模型 加 名字 地址 模型 钥匙'};
        }
        const saved = await upsertLlmConfig(env, {
            name: parsed.name,
            type: parsed.type,
            apiUrl,
            apiKey: parsed.apiKey,
            model,
        });
        return {
            message: saved.isDefault
                ? `好，${saved.name} 记下了，${saved.type} 先用这套`
                : `好，${saved.name} 记下了`,
        };
    }

    if (action === '改') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '改哪套写后面'};
        const existing = await getLlmConfig(env, name);
        if (!existing) return {message: '没这套'};
        const parsed = parsePatch(rest.slice(1));
        if (typeof parsed === 'string') return {message: parsed};
        await upsertLlmConfig(env, {
            name,
            type: parsed.type || existing.type,
            apiUrl: parsed.apiUrl || existing.apiUrl,
            apiKey: parsed.apiKey || existing.apiKey,
            model: parsed.model || existing.model,
        });
        return {message: `改好了，还是 ${name}`};
    }

    if (action === '用' || action === '切' || action === '换成') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '用哪套写后面'};
        const saved = await setDefaultLlmConfig(env, name);
        return {message: saved ? `好，${saved.type} 换成 ${saved.name} 了` : '没这套'};
    }

    if (action === '停' || action === '关') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '停哪套写后面'};
        const saved = await setLlmConfigStatus(env, name, 'disabled');
        return {message: saved ? `好，${name} 停了` : '没这套'};
    }

    if (action === '开' || action === '启用') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '开哪套写后面'};
        const saved = await setLlmConfigStatus(env, name, 'active');
        return {message: saved ? `好，${name} 开了` : '没这套'};
    }

    if (action === '删' || action === '去掉') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '删哪套写后面'};
        const ok = await deleteLlmConfig(env, name);
        return {message: ok ? `好，${name} 撤了` : '没这套'};
    }

    if (action === '看') {
        const name = normalizeName(rest[0] ?? '');
        if (!name) return {message: '看哪套写后面'};
        const item = await getLlmConfig(env, name);
        return {message: item ? formatConfig(item, true) : '没这套'};
    }

    if (action && rest.length === 0) {
        const item = await getLlmConfig(env, normalizeName(action));
        if (item) return {message: formatConfig(item, true)};
        if (['加', '改', '用', '切', '换成', '停', '关', '开', '启用', '删', '去掉', '看'].includes(action)) {
            return {message: HELP};
        }
    }

    const items = await listLlmConfigs(env);
    if (!items.length) return {message: `还没配。\n${HELP}`};
    return {
        message: items.map((item) => (
            `${item.status === 'disabled' ? '⏸ ' : item.isDefault ? '▶ ' : ''}${item.name}  ${item.type}  ${item.model}  ${maskKey(item.apiKey)}`
        )).join('\n'),
    };
}
