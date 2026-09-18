import {linkReply, textReply, type ReplyMessage} from '../../core/reply.js';
import type {ChannelAdapter, RevokeResult} from '../types.js';
import {WEB_PLATFORM} from './types.js';

function looksLikeHttp(value?: string): boolean {
    const lower = value?.trim().toLowerCase() ?? '';
    return lower.startsWith('http://') || lower.startsWith('https://');
}

/** 浏览器发不了微信协议，能展示的留下，其余收成链接或一句话。 */
export function presentForWeb(reply: ReplyMessage): ReplyMessage {
    switch (reply.type) {
        case 'music': {
            const url = looksLikeHttp(reply.url) ? reply.url : reply.dataUrl;
            if (looksLikeHttp(url)) {
                return linkReply(reply.title || '音乐', url ?? '', reply.singer, reply.thumbUrl);
            }
            return textReply(reply.title ? `想听「${reply.title}」，但这头没链` : '歌没链');
        }
        case 'app':
            return textReply('这条应用消息这边看不了');
        case 'chat-record': {
            const title = reply.title?.trim() || '聊天记录';
            const lines = reply.items
                .filter((item) => item.nickname.trim() && item.content.trim())
                .map((item) => `${item.nickname.trim()}：${item.content.trim()}`);
            return textReply(lines.length ? `${title}\n${lines.join('\n')}` : title);
        }
        case 'card':
            return textReply(reply.nickname?.trim() || reply.username ? `名片：${reply.nickname || reply.username}` : '一张名片');
        case 'position': {
            const name = [reply.label, reply.poiName].filter(Boolean).join(' ');
            return textReply(name || `${reply.lat},${reply.lon}`);
        }
        case 'forward':
            return textReply('转发消息这边看不了');
        default:
            return reply;
    }
}

export const webAdapter: ChannelAdapter = {
    platform: WEB_PLATFORM,

    async send(_message, replies) {
        return presentForWebList(replies).map(() => ({ok: true}));
    },

    async revoke(): Promise<RevokeResult> {
        return {ok: false, reason: 'unsupported'};
    },

    toOutboundText(reply) {
        if (reply.type !== 'chat-record') return null;
        const presented = presentForWeb(reply);
        return presented.type === 'text' ? presented.content : null;
    },
};

export function presentForWebList(replies: ReplyMessage[]): ReplyMessage[] {
    return replies.map(presentForWeb);
}
