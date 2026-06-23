import type {TextMessage} from '../../types.js';
import {
    buildNotifyHelpText,
    matchesNotifyCommand,
    NOTIFY_HELP_COMMAND,
    parseNotifyCommand,
    sendNotifyMessage,
} from './service.js';

export const notifyPlugin: TextMessage = {
    type: 'text',
    name: 'notify',
    description: '主人通知转发：通知 接收者 内容',
    match: (content) => matchesNotifyCommand(content),
    handle: async (message, env) => {
        try {
            const content = message.content?.trim() ?? '';
            if (content === NOTIFY_HELP_COMMAND) {
                return {type: 'text', content: buildNotifyHelpText()};
            }

            const command = parseNotifyCommand(content, message);
            if (!command) return {type: 'text', content: buildNotifyHelpText()};

            const result = await sendNotifyMessage(message, env, command);
            return {type: 'text', content: result};
        } catch {
            return {type: 'text', content: '没发成，再试下 🙏'};
        }
    },
};
