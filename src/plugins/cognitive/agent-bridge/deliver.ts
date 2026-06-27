import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {TextReply} from '../../../types/reply.js';
import {recordOutboundChatMessage} from '../../../chat-log/index.js';
import {logger} from '../../../utils/logger.js';
import {WechatApi, sendWechatReply} from '../../../wechat';

function resolveReceiver(message: IncomingMessage): string {
    if (message.source === 'group' && message.room?.id?.trim()) {
        return message.room.id.trim();
    }
    return message.from.trim();
}

export async function deliverAgentBridgeTextReply(
    message: IncomingMessage,
    env: Env,
    content: string,
): Promise<void> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        logger.warn('Agent 桥接回包失败：未配置 WECHAT_API_BASE_URL');
        return;
    }

    const receiver = resolveReceiver(message);
    const reply: TextReply = {type: 'text', content};
    const api = new WechatApi(apiBaseUrl);

    try {
        await sendWechatReply(api, reply, receiver);
        await recordOutboundChatMessage(env, message, reply, {
            causedByMessageId: message.messageId,
            replyIndex: 1,
            replyStatus: 'sent',
        });
    } catch (error) {
        await recordOutboundChatMessage(env, message, reply, {
            causedByMessageId: message.messageId,
            replyIndex: 1,
            replyStatus: 'failed',
        });
        logger.error('Agent 桥接回包发送失败', {
            receiver,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export function formatAgentBridgeError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        const message = error.message.trim();
        if (/超时/u.test(message)) return '搞太久了，我先歇会儿，你过会再喊我 😅';
        if (/401|403|unauthorized|forbidden/iu.test(message)) return 'Agent 那边不认这个口令，检查一下 token';
        if (/fetch failed|network|ECONNREFUSED|Failed to connect/iu.test(message)) {
            return '连不上 Agent，看看本机 Gateway 和隧道是不是开着';
        }
        return '这次没搞成，再试下';
    }
    return '这次没搞成，再试下';
}
