import type {TextMessage} from '../../types.js';
import {parseXiuxianCommand} from './commands.js';
import {unknownCommandText} from './reply.js';
import {handleXiuxianCommand} from './service.js';

export const xiuxianPlugin: TextMessage = {
    type: 'text',
    name: 'xiuxian-plugin',
    description: '文本修仙 MVP 插件（创建/修炼/探索/背包/挑战）',
    match: (content) => {
        const text = (content ?? '').trim();
        return text.startsWith('修仙');
    },
    handle: async (message, env) => {
        const cmd = parseXiuxianCommand((message.content ?? '').trim());
        if (!cmd) return {type: 'text', content: unknownCommandText()};
        return handleXiuxianCommand(env.XBOT_DB, message, cmd);
    },
};

