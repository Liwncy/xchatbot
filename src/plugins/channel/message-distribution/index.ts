import {markedCommand} from '../../../core/command-mark.js';
import {matchesDistributionRule} from '../../../core/message-distribution/matcher.js';
import {listDistributionRules} from '../../../core/message-distribution/repository.js';
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
        let rules: Awaited<ReturnType<typeof listDistributionRules>>;
        try {
            rules = await listDistributionRules(ctx.env, true);
        } catch (error) {
            logger.warn('分发规则暂时读不了，已跳过自动分发', {
                messageId: message.messageId,
                error: error instanceof Error ? error.message : String(error),
            });
            return message.source === 'official' ? handledReply() : null;
        }
        const matched = rules.filter((rule) => matchesDistributionRule(rule, message));
        for (const rule of matched) {
            ctx.waitUntil(dispatchDistribution(message, ctx, rule.targets, [message], rule.contentPolicy, {
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
