import {markedCommand} from '../../../core/command-mark.js';
import {matchesDistributionRule} from '../../../core/message-distribution/matcher.js';
import {
    claimDistributionDelivery,
    listDistributionRules,
} from '../../../core/message-distribution/repository.js';
import {buildDistributionReplies} from '../../../core/message-distribution/transform.js';
import {handledReply, type HandlerResponse, type ReplyMessage} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';

async function distribute(
    message: Parameters<Plugin['handle']>[0],
    ctx: Parameters<Plugin['handle']>[1],
    ruleId: string,
    targets: Awaited<ReturnType<typeof listDistributionRules>>[number]['targets'],
    replies: ReplyMessage[],
): Promise<void> {
    if (replies.length === 0) return;
    for (const target of targets) {
        const adapter = target.platform === ctx.adapter?.platform
            ? ctx.adapter
            : ctx.resolveAdapter?.(target.platform);
        if (!adapter?.supportsProactiveSend) {
            logger.warn('分发目标适配器不可用', {
                ruleId,
                sourcePlatform: message.platform,
                targetPlatform: target.platform,
                target: target.id,
            });
            continue;
        }
        const claimed = await claimDistributionDelivery(
            ctx.env,
            ruleId,
            message.platform,
            message.messageId,
            target,
        );
        if (!claimed) continue;
        const targeted = replies.map((reply) => ({...reply, to: target.id}));
        const targetMessage = {
            ...message,
            platform: target.platform,
            source: target.kind === 'group' ? 'group' as const : 'private' as const,
            from: target.kind === 'user' ? target.id : message.from,
            room: target.kind === 'group' ? {id: target.id} : undefined,
        };
        await adapter.send(targetMessage, targeted, ctx.env);
    }
}

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
            ctx.waitUntil(distribute(message, ctx, rule.id, rule.targets, replies).catch((error) => {
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
