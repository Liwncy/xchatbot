import type {IncomingMessage} from '../types/message.js';

export interface ChatLogHandleMeta {
    pluginName?: string;
}

const metaByMessage = new WeakMap<IncomingMessage, ChatLogHandleMeta>();

export function setChatLogHandleMeta(message: IncomingMessage, meta: ChatLogHandleMeta): void {
    metaByMessage.set(message, {...metaByMessage.get(message), ...meta});
}

export function getChatLogHandleMeta(message: IncomingMessage): ChatLogHandleMeta | undefined {
    return metaByMessage.get(message);
}
