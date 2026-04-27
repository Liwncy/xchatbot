import type {TextMessage} from '../../../types.js';
import type {Env, HandlerResponse, IncomingMessage} from '../../../../types/message.js';
import {parseXiuxianCommand} from './commands/index.js';
import {finalizeXiuxianReply} from './forward-reply.js';
import {unknownCommandText} from './reply/index.js';
import {handleXiuxianCommand} from './service.js';

export function matchXiuxianContent(content: string): boolean {
    const text = (content ?? '').trim();
    return text.startsWith('修仙');
}

export async function handleXiuxianPluginMessage(message: IncomingMessage, env: Env): Promise<HandlerResponse> {
    const cmd = parseXiuxianCommand((message.content ?? '').trim());
    if (!cmd) return finalizeXiuxianReply(message, null, {type: 'text', content: unknownCommandText()});
    const response = await handleXiuxianCommand(env.XBOT_DB, env.XBOT_KV, message, cmd);
    return finalizeXiuxianReply(message, cmd, response);
}

export const xiuxianPlugin: TextMessage = {
    type: 'text',
    name: 'xiuxian-plugin',
    description: '文本修仙 MVP 插件（创建/修炼/探索/背包/挑战/拍卖）',
    match: (content: string) => matchXiuxianContent(content),
    handle: handleXiuxianPluginMessage,
};
