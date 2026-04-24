import type {TextMessage} from '../types.js';
import {buildSingleWechatChatRecordAppReply} from '../../wechat/chat-record.js';

const TRIGGERS = new Set([
    '聊天记录演示',
    '聊天记录卡片演示',
    '合并转发演示',
]);

function resolveDemoContent(content?: string): string {
    const trimmed = content?.trim() ?? '';
    for (const trigger of TRIGGERS) {
        if (trimmed === trigger) {
            return trimmed;
        }
        if (trimmed.startsWith(`${trigger} `)) {
            return trimmed.slice(trigger.length).trim() || trimmed;
        }
    }
    return trimmed;
}

export const wechatChatRecordDemoPlugin: TextMessage = {
    type: 'text',
    name: 'wechat-chat-record-demo',
    description: '发送“聊天记录演示”查看微信聊天记录卡片示例',
    match: (content) => {
        const trimmed = content.trim();
        if (!trimmed) return false;
        return Array.from(TRIGGERS).some((trigger) => trimmed === trigger || trimmed.startsWith(`${trigger} `));
    },
    handle: async (message) => {
        const nickname = message.senderName?.trim() || message.from.trim() || message.to.trim();
        const content = resolveDemoContent(message.content) || message.messageId;

        return buildSingleWechatChatRecordAppReply({
            nickname,
            content,
            mentionNickname: message.source === 'group' ? nickname : undefined,
            timestampMs: message.timestamp * 1000,
            title: message.source === 'group' ? '群聊的聊天记录' : '聊天记录',
        });
    },
};


