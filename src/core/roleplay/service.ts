import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {resolveOwnerId} from '../bot.js';
import type {IncomingMessage} from '../message.js';
import {
    createCharacter,
    getCharacter,
    isQueryCommand,
    matchCommandId,
} from './catalog.js';
import {clearBoundRoleKey, getBoundRoleKey, setBoundRoleKey} from './store.js';
import {NORMAL_ID, type RoleplayCharacter} from './types.js';

const ADD_CMD = /^(?:加角色|增加角色|新增角色)\s*[:：]?\s*(.*)$/su;

export function wrapUserContent(content: string, character: RoleplayCharacter | null): string {
    const instruction = character?.instruction?.trim() ?? '';
    if (!instruction) return content;
    return `${instruction}\n\n${content}`;
}

export async function currentCharacter(
    env: Env,
    message: IncomingMessage,
): Promise<RoleplayCharacter | null> {
    const id = await getBoundRoleKey(env, message);
    const character = await getCharacter(env, id ?? undefined);
    if (id && !character) await clearBoundRoleKey(env, message);
    return character;
}

function tryParseAdd(stripped: string): {name: string; instruction: string} | null {
    const match = ADD_CMD.exec(stripped);
    if (!match) return null;
    const rest = match[1]?.trim() ?? '';
    if (!rest) return {name: '', instruction: ''};
    const lines = rest.split(/\r?\n/u, 2);
    const first = lines[0]?.trim() ?? '';
    let split = first.indexOf(' ');
    if (split < 0) split = first.indexOf('　');
    if (split < 0) {
        return {name: first, instruction: lines[1]?.trim() ?? ''};
    }
    const name = first.slice(0, split).trim();
    const sameLine = first.slice(split + 1).trim();
    const instruction = lines.length > 1
        ? (sameLine ? `${sameLine}\n${lines[1].trim()}` : lines[1].trim())
        : sameLine;
    return {name, instruction};
}

export async function tryHandleRoleplay(
    env: Env,
    message: IncomingMessage,
    commandText: string,
): Promise<string | null> {
    if (message.type !== 'text') return null;
    const stripped = commandText.trim();
    if (!stripped) return null;

    const add = tryParseAdd(stripped);
    if (add) {
        const ownerId = resolveOwnerId(env, message.platform);
        if (!ownerId || message.from.trim() !== ownerId) return '这个我加不了';
        if (!add.name && !add.instruction) return '名字和演法写一起，换行也行';
        const error = await createCharacter(env, add.name, add.instruction);
        return error ?? `好，记下了。说 #扮演 ${add.name.trim()} 就行`;
    }

    if (isQueryCommand(stripped)) {
        const current = await currentCharacter(env, message);
        return current ? `现在演${current.name}` : '现在没演';
    }

    const targetId = await matchCommandId(env, stripped);
    if (!targetId) return null;
    const previous = await getBoundRoleKey(env, message);
    if (targetId === NORMAL_ID) {
        await clearBoundRoleKey(env, message);
        logger.info('演法已退', {platform: message.platform, from: message.from});
        return '好，不当了。';
    }
    const character = await getCharacter(env, targetId);
    if (!character) return null;
    await setBoundRoleKey(env, message, character.id);
    logger.info('演法已切', {from: previous, to: character.id});
    return character.ack || `好，${character.name}。`;
}
