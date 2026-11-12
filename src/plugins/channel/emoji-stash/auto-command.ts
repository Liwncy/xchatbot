import {resolveOwnerId} from '../../../core/bot.js';
import {resolveChatSession} from '../../../core/chat-log/session.js';
import {
    clearAutoSetting,
    clearPersonaOpen,
    DEFAULT_AUTO_CHANCE,
    readPersonaOpen,
    resolveAutoConfig,
    writeAutoSetting,
    writePersonaOpen,
    type AutoScope,
    type AutoSetting,
} from '../../../core/emoji-stash/index.js';
import {resolveEmojiStashCategoryToken} from '../../../core/emoji-stash/categories.js';
import type {IncomingMessage} from '../../../core/message.js';
import {getPersona, matchCommandId} from '../../../core/persona/catalog.js';
import {NORMAL_ID} from '../../../core/persona/types.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Env} from '../../../types/env.js';

const NOT_OWNER = '这事只有主人能定';
const MAX_OPEN_TOKENS = 30;

const ON_WORDS = new Set(['开', '开启', '打开', 'on']);
const OFF_WORDS = new Set(['关', '关闭', '关掉', 'off']);
const RESET_WORDS = new Set(['默认', '清除', '重置']);

export function isAutoCommand(command: string): boolean {
    return command.startsWith('表情配图') || command.startsWith('表情开放');
}

function isOwner(env: Env, message: IncomingMessage): boolean {
    const ownerId = resolveOwnerId(env, message.platform);
    return Boolean(ownerId && message.senderId.trim() === ownerId);
}

function words(raw: string): string[] {
    return raw.replace(/[,，、;；]/gu, ' ').split(/\s+/u).map((item) => item.trim()).filter(Boolean);
}

function scopeLabel(scope: AutoScope): string {
    if (scope === 'platform') return '这个平台';
    if (scope === 'global') return '全部会话';
    return '这儿';
}

function layerText(setting: AutoSetting): string {
    const parts: string[] = [];
    if (setting.on !== undefined) parts.push(setting.on ? '开' : '关');
    if (setting.chance !== undefined) parts.push(`${setting.chance}%`);
    return parts.length ? parts.join(' ') : '-';
}

async function autoStatus(env: Env, message: IncomingMessage): Promise<HandlerResponse> {
    const {sessionId} = resolveChatSession(message);
    const {config, layers} = await resolveAutoConfig(env, message.platform, sessionId);
    const head = config.on ? `开着，概率 ${config.chance}%` : '关着';
    const detail = `本会话 ${layerText(layers.session)} · 平台 ${layerText(layers.platform)} · 全部 ${layerText(layers.global)}`;
    const hint = config.on ? '' : `\n要开写 #表情配图 开 ${DEFAULT_AUTO_CHANCE}`;
    return textReply(`${head}\n${detail}${hint}`);
}

async function handleAuto(rest: string, message: IncomingMessage, env: Env): Promise<HandlerResponse> {
    const tokens = words(rest);
    if (tokens.length === 0) return autoStatus(env, message);

    let scope: AutoScope = 'session';
    if (tokens[0] === '平台') scope = 'platform';
    else if (tokens[0] === '全部') scope = 'global';
    if (scope !== 'session') tokens.shift();
    if (tokens.length === 0) return autoStatus(env, message);

    const patch: AutoSetting = {};
    let reset = false;
    for (const token of tokens) {
        const lower = token.toLowerCase();
        const number = /^(\d{1,3})%?$/u.exec(lower);
        if (lower === '概率') continue;
        if (ON_WORDS.has(lower)) patch.on = true;
        else if (OFF_WORDS.has(lower)) patch.on = false;
        else if (RESET_WORDS.has(lower)) reset = true;
        else if (number) patch.chance = Math.min(100, Number(number[1]));
        else return textReply('写「开」「关」或概率，比如 #表情配图 开 30');
    }

    if (!isOwner(env, message)) return textReply(NOT_OWNER);
    const {sessionId} = resolveChatSession(message);

    if (reset) {
        await clearAutoSetting(env, scope, message.platform, sessionId);
        return textReply(`好，${scopeLabel(scope)}不单独设了，跟着上一层`);
    }
    await writeAutoSetting(env, scope, message.platform, sessionId, patch);

    const where = scopeLabel(scope);
    if (patch.on === false) return textReply(`好，${where}关了`);
    if (patch.on === true) {
        const chance = patch.chance !== undefined ? `，概率 ${patch.chance}%` : '';
        return textReply(`好，${where}开了${chance}`);
    }
    return textReply(`好，${where}概率改成 ${patch.chance}%`);
}

async function handleOpen(rest: string, message: IncomingMessage, env: Env): Promise<HandlerResponse> {
    const tokens = words(rest);
    if (tokens.length === 0) return textReply('写人格名和要放的标签或分类，比如 #表情开放 阴阳 无语 嘲讽');

    const roleKey = await matchCommandId(env, tokens[0] ?? '');
    if (roleKey === NORMAL_ID) return textReply('没带人格的不用放，直接 #表情配图 开就行');
    if (!roleKey) return textReply('没这个人格 🤔');
    const name = (await getPersona(env, roleKey))?.name ?? tokens[0] ?? roleKey;
    const args = tokens.slice(1);

    if (args.length === 0) {
        const open = await readPersonaOpen(env, roleKey);
        if (!open) return textReply(`${name}还没放开，带着它不会配图`);
        const shown = [...open.tags, ...open.categories.map((item) => `/${item}`)].join(' ');
        return textReply(`${name}能配：${shown}`);
    }

    if (!isOwner(env, message)) return textReply(NOT_OWNER);

    if (args.length === 1 && args[0] === '清空') {
        await clearPersonaOpen(env, roleKey);
        return textReply(`好，${name}收回了`);
    }

    const tags = new Set<string>();
    const categories = new Set<string>();
    for (const token of args.slice(0, MAX_OPEN_TOKENS)) {
        if (token.length > 16) continue;
        const category = resolveEmojiStashCategoryToken(token.replace(/^[/#]/u, ''));
        if (category) {
            categories.add(category);
            if (category !== token.toLowerCase()) tags.add(token);
            continue;
        }
        tags.add(token.replace(/^[/#]/u, ''));
    }
    if (tags.size === 0 && categories.size === 0) return textReply('没看懂要放哪些 🤔');

    await writePersonaOpen(env, roleKey, {tags: [...tags], categories: [...categories]});
    const shown = [...tags, ...[...categories].map((item) => `/${item}`)].join(' ');
    return textReply(`好，${name}能配：${shown}`);
}

export async function handleAutoCommand(
    command: string,
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse> {
    if (command.startsWith('表情配图')) return handleAuto(command.slice(4), message, env);
    return handleOpen(command.slice(4), message, env);
}
