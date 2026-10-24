import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {resolveOwnerId} from '../bot.js';
import type {IncomingMessage} from '../message.js';
import {
    createPersona,
    getPersona,
    isQueryCommand,
    matchCommandId,
} from './catalog.js';
import {resetSnailaiConversation} from '../snailai-session.js';
import {clearBoundRoleKey, getBoundRoleKey, setBoundRoleKey} from './store.js';
import {NORMAL_ID, type Persona} from './types.js';

const ADD_CMD = /^(?:加人格|增加人格|新增人格)\s*[:：]?\s*(.*)$/su;

const PLAY_MARK = '## 人格';

export function wrapUserContent(content: string, persona: Persona | null): string {
    const instruction = persona?.instruction?.trim() ?? '';
    if (!instruction) return content;
    return `${content.trimEnd()}\n\n${PLAY_MARK}\n\n${instruction}`;
}

export async function currentPersona(
    env: Env,
    message: IncomingMessage,
): Promise<Persona | null> {
    const id = await getBoundRoleKey(env, message);
    const persona = await getPersona(env, id ?? undefined);
    if (id && !persona) await clearBoundRoleKey(env, message);
    return persona;
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

export async function tryHandlePersona(
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
        if (!ownerId || message.senderId.trim() !== ownerId) return '这个我加不了';
        if (!add.name && !add.instruction) return '名字和怎么说写一起，换行也行';
        const error = await createPersona(env, add.name, add.instruction);
        return error ?? `好，记下了。说 #人格 ${add.name.trim()} 就行`;
    }

    if (isQueryCommand(stripped)) {
        const current = await currentPersona(env, message);
        return current ? `现在是${current.name}` : '现在没换';
    }

    const targetId = await matchCommandId(env, stripped);
    if (!targetId) return null;
    const previous = await getBoundRoleKey(env, message);
    if (targetId === NORMAL_ID) {
        await clearBoundRoleKey(env, message);
        if (previous) await resetSnailaiConversation(env, message);
        logger.info('人格已退', {platform: message.platform, senderId: message.senderId});
        return '好，正常了。';
    }
    const persona = await getPersona(env, targetId);
    if (!persona) return null;
    await setBoundRoleKey(env, message, persona.id);
    if (previous !== persona.id) await resetSnailaiConversation(env, message);
    logger.info('人格已切', {from: previous, to: persona.id});
    return persona.ack || `好，${persona.name}。`;
}
