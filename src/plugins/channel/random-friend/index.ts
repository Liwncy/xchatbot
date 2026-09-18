import {resolveBotName} from '../../../core/bot.js';
import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';
import {buildRandomFriendCard} from './card.js';
import {isRandomFriendCommand, searchRandomFriend} from './finder.js';

export const randomFriendPlugin: Plugin = {
    manifest: {
        name: 'random-friend',
        platforms: '*',
        kind: 'channel',
        priority: 15,
        impl: 'local',
    },
    match(message, ctx) {
        if (message.type !== 'text' && message.type !== 'link') return false;
        const command = markedCommand(message, ctx.env);
        return command != null && isRandomFriendCommand(command);
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const search = ctx.adapter?.searchDirectory;
        if (!search) return textReply('这头找不了人');

        try {
            const {candidate, phone, attempts} = await searchRandomFriend((keyword) => search(keyword, ctx.env));
            if (!candidate) {
                return textReply(`翻了 ${attempts} 个号码都没人在线，最后拨的是 ${phone}，下次再来碰碰运气嘛`);
            }

            logger.info('随机朋友命中', {
                phone,
                attempts,
                id: candidate.id,
                nickname: candidate.nickname,
                gender: candidate.gender,
            });

            const timestampMs = Math.max(Date.now(), message.timestamp * 1000);
            return buildRandomFriendCard(candidate, phone, timestampMs, resolveBotName(ctx.env));
        } catch (error) {
            logger.error('随机朋友失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return textReply('没找成，过会儿再试');
        }
    },
};
