import type {IncomingMessage} from '../../../core/message.js';

export function isBotMentioned(
    message: IncomingMessage,
    botName?: string,
    botId?: string,
): boolean {
    const name = botName?.trim() ?? '';
    const id = botId?.trim() ?? '';
    const content = message.content ?? '';
    if (content.includes('在群聊中@了你') || content.includes('@了你')) return true;
    if (name && content.includes(name)) return true;
    if (id && message.mentions?.some((item) => item.id.trim() === id)) return true;

    const quotedFrom = message.quote?.referFrom?.trim() ?? '';
    const quotedName = message.quote?.referSenderName?.trim() ?? '';
    if (id && quotedFrom && quotedFrom === id) return true;
    if (name && quotedName && quotedName === name) return true;
    return false;
}
