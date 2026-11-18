import {resolveBotId, resolveBotName, stripBotPrefix} from './bot.js';
import type {IncomingMessage} from './message.js';
import type {Env} from '../types/env.js';

/** 口令后面可以换行（多行正文、伪转发脚本），所以要匹配到换行之后。 */
const MARKER = /^[#＃]\s*([\s\S]*)$/u;

export function extractMarkedCommand(stripped: string): string | null {
    const match = MARKER.exec(stripped.trim());
    if (!match) return null;
    return match[1]?.trim() ?? '';
}

export function markedCommand(
    message: IncomingMessage,
    env: Env,
): string | null {
    const stripped = stripBotPrefix(
        message.content?.trim() ?? '',
        resolveBotName(env),
        resolveBotId(env, message.platform),
    );
    return extractMarkedCommand(stripped);
}
