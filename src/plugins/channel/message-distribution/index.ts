import {markedCommand} from '../../../core/command-mark.js';
import {matchesDistributionRule} from '../../../core/message-distribution/matcher.js';
import {listDistributionRules} from '../../../core/message-distribution/repository.js';
import {buildDistributionReplies} from '../../../core/message-distribution/transform.js';
import {handledReply, type HandlerResponse} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';
import {dispatchDistribution} from './dispatch.js';

export const messageDistributionPlugin: Plugin = {
    manifest: {
        name: 'message-distribution',
        platforms: '*',
        kind: 'channel',
        priority: 0,
        impl: 'local',
    },
    match() {
        return true;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        if (markedCommand(message, ctx.env) != null) {
            return message.source === 'official' ? handledReply() : null;
        }
        const rules = await listDistributionRules(ctx.env, true);
        const matched = rules.filter((rule) => matchesDistributionRule(rule, message));
        for (const rule of matched) {
            const replies = await buildDistributionReplies(ctx.env, message, rule);
            ctx.waitUntil(dispatchDistribution(message, ctx, rule.targets, replies, {
                dedupeRuleId: rule.id,
            }).catch((error) => {
                logger.error('消息分发失败', {
                    ruleId: rule.id,
                    messageId: message.messageId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }));
        }
        if (message.source === 'official') return handledReply();
        return matched.some((rule) => !rule.continuePipeline) ? handledReply() : null;
    },
};
