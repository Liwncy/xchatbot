import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import {claimDistributionDelivery} from '../../../core/message-distribution/repository.js';
import {buildDistributionRepliesWithPolicy} from '../../../core/message-distribution/transform.js';
import type {DistributionContentPolicy, DistributionTarget} from '../../../core/message-distribution/types.js';
import type {ReplyMessage} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import type {ChannelAdapter} from '../../../adapter/types.js';

export interface DistributionDispatchResult {
    sent: number;
    failed: number;
    skipped: number;
}

function resolveAdapter(ctx: PluginContext, platform: string): ChannelAdapter | undefined {
    return platform === ctx.adapter?.platform ? ctx.adapter : ctx.resolveAdapter?.(platform);
}

async function preparePayloads(
    messages: IncomingMessage[],
    ctx: PluginContext,
): Promise<IncomingMessage[]> {
    return Promise.all(messages.map(async (message) => {
        const sourceAdapter = resolveAdapter(ctx, message.platform);
        return await sourceAdapter?.prepareForDistribution?.(message, ctx.env) ?? message;
    }));
}

async function buildPreparedReplies(
    messages: IncomingMessage[],
    ctx: PluginContext,
    policy: DistributionContentPolicy,
    targetPlatform: string,
): Promise<ReplyMessage[]> {
    const targetAdapter = resolveAdapter(ctx, targetPlatform);
    const replies: ReplyMessage[] = [];
    for (const message of messages) {
        if (policy.mode === 'original' || policy.mode === 'auto') {
            const nativeReplies = await targetAdapter?.toOutboundReplies?.(message, ctx.env);
            if (nativeReplies?.length) {
                replies.push(...nativeReplies);
                continue;
            }
        }
        replies.push(...await buildDistributionRepliesWithPolicy(ctx.env, message, policy));
    }
    return replies;
}

export async function buildDistributionTargetReplies(
    messages: IncomingMessage[],
    ctx: PluginContext,
    policy: DistributionContentPolicy,
    targetPlatform: string,
): Promise<ReplyMessage[]> {
    return buildPreparedReplies(await preparePayloads(messages, ctx), ctx, policy, targetPlatform);
}

export async function dispatchDistribution(
    message: IncomingMessage,
    ctx: PluginContext,
    targets: DistributionTarget[],
    payloads: IncomingMessage[],
    policy: DistributionContentPolicy,
    options?: {dedupeRuleId?: string},
): Promise<DistributionDispatchResult> {
    const result: DistributionDispatchResult = {sent: 0, failed: 0, skipped: 0};
    if (payloads.length === 0) {
        result.skipped = targets.length;
        return result;
    }
    const prepared = await preparePayloads(payloads, ctx);
    const repliesByPlatform = new Map<string, Promise<ReplyMessage[]>>();

    for (const target of targets) {
        const adapter = resolveAdapter(ctx, target.platform);
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

        let platformReplies = repliesByPlatform.get(target.platform);
        if (!platformReplies) {
            platformReplies = buildPreparedReplies(prepared, ctx, policy, target.platform);
            repliesByPlatform.set(target.platform, platformReplies);
        }
        const replies = await platformReplies;
        if (replies.length === 0) {
            result.skipped += 1;
            continue;
        }
        const targeted = replies.map((reply) => ({...reply, to: target.id}));
        const targetMessage: IncomingMessage = {
            ...message,
            platform: target.platform,
            chatId: target.id,
        };
        try {
            const receipts = await adapter.send(targetMessage, targeted, ctx.env, {failureNotice: false});
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
