import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import {claimDistributionDelivery} from '../../../core/message-distribution/repository.js';
import type {DistributionTarget} from '../../../core/message-distribution/types.js';
import type {ReplyMessage} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';

export interface DistributionDispatchResult {
    sent: number;
    failed: number;
    skipped: number;
}

export async function dispatchDistribution(
    message: IncomingMessage,
    ctx: PluginContext,
    targets: DistributionTarget[],
    replies: ReplyMessage[],
    options?: {dedupeRuleId?: string},
): Promise<DistributionDispatchResult> {
    const result: DistributionDispatchResult = {sent: 0, failed: 0, skipped: 0};
    if (replies.length === 0) {
        result.skipped = targets.length;
        return result;
    }

    for (const target of targets) {
        const adapter = target.platform === ctx.adapter?.platform
            ? ctx.adapter
            : ctx.resolveAdapter?.(target.platform);
        if (!adapter?.supportsProactiveSend) {
            logger.warn('分发目标适配器不可用', {
                sourcePlatform: message.platform,
                targetPlatform: target.platform,
                target: target.id,
            });
            result.failed += 1;
            continue;
        }

        if (options?.dedupeRuleId) {
            const claimed = await claimDistributionDelivery(
                ctx.env,
                options.dedupeRuleId,
                message.platform,
                message.messageId,
                target,
            );
            if (!claimed) {
                result.skipped += 1;
                continue;
            }
        }

        const targeted = replies.map((reply) => ({...reply, to: target.id}));
        const targetMessage: IncomingMessage = {
            ...message,
            platform: target.platform,
            chatId: target.id,
        };
        try {
            const receipts = await adapter.send(targetMessage, targeted, ctx.env);
            if (receipts.some((receipt) => receipt.ok)) result.sent += 1;
            else result.failed += 1;
        } catch (error) {
            logger.warn('消息没分发出去', {
                targetPlatform: target.platform,
                target: target.id,
                error: error instanceof Error ? error.message : String(error),
            });
            result.failed += 1;
        }
    }
    return result;
}
