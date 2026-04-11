import type {TextMessage} from '../../types.js';
import {parseXiuxianCommand} from './commands.js';
import {handleXiuxianCommand} from './service.js';

export const xiuxianPlugin: TextMessage = {
    type: 'text',
    name: 'xiuxian-plugin',
    description: '文本修仙 MVP 插件（创建/修炼/探索/背包/挑战）',
    match: (content) => parseXiuxianCommand(content) !== null,
    handle: async (message, env) => {
        const cmd = parseXiuxianCommand((message.content ?? '').trim());
        if (!cmd) return null;
        return handleXiuxianCommand(env.XBOT_DB, message, cmd);
    },
};

