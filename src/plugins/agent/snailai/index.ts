/**
 * SnailAI 大脑。门禁和口令已经在前面拦过，这里只吃拼好的正文。
 *
 * 同步 OpenAPI 对话，把回答收成 HandlerResponse，适配器发出去。
 * 切到这颗脑子：AGENT_BRAIN=snailai，并配 SNAIL_AI_BASE_URL / APP_ID / TOKEN。
 */
import {resolveAgentBrain} from '../../../core/brain.js';
import {findRecentPublicMedia, patchInboundMediaPublicUrl} from '../../../core/chat-log/index.js';
import {buildInboundContent} from '../../../core/inbound.js';
import {parseRepliesFromText} from '../../../core/outbound.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';
import {parseBool} from '../../../utils/bool.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';
import {resolveOpenClawMedia} from '../openclaw/resolve-media.js';
import {
    canUploadImage,
    chatSync,
    fetchImageBytes,
    imageFileName,
    readSnailAiConfig,
    registerOpenId,
    subscribeAgent,
    uploadChatImage,
    type SnailAiConfig,
} from './client.js';
import {
    isSubscribed,
    loadCachedOpenId,
    markSubscribed,
    resolveConversationId,
    snailaiExternalId,
    snailaiNickname,
    storeOpenId,
} from '../../../core/snailai-session.js';

const ADVISOR_LINE = /^\s*\[Advisor\s+(?:consultation\s+#\d+|review)\]\s*$/gimu;
const FAIL_COPY = ['没整好，待会再试', '这轮没搞定', '这边有点懵 😅'];

function sanitizeAnswer(text: string): string {
    return text.replace(ADVISOR_LINE, '').trim();
}

function looksLikeError(text: string): boolean {
    const raw = text.trim();
    if (!raw) return true;
    const lower = raw.toLowerCase();
    return raw.startsWith('[ERROR]')
        || lower.includes('exception')
        || lower.startsWith('error:');
}

function friendlyFail(): string {
    return FAIL_COPY[Math.floor(Math.random() * FAIL_COPY.length)] ?? FAIL_COPY[0];
}

async function ensureOpenId(
    env: Env,
    config: SnailAiConfig,
    message: IncomingMessage,
): Promise<string> {
    const externalId = snailaiExternalId(message);
    const cached = await loadCachedOpenId(env, externalId);
    if (cached) return cached;
    const openId = await registerOpenId(config, externalId, snailaiNickname(message));
    await storeOpenId(env, externalId, openId);
    return openId;
}

async function ensureSubscribed(
    env: Env,
    config: SnailAiConfig,
    openId: string,
): Promise<void> {
    if (await isSubscribed(env, openId, config.agentId)) return;
    await subscribeAgent(config, openId);
    await markSubscribed(env, openId, config.agentId);
}

async function maybeUploadImage(
    config: SnailAiConfig,
    openId: string,
    imageUrl?: string,
): Promise<number[]> {
    if (!imageUrl) return [];
    const fetched = await fetchImageBytes(imageUrl);
    if (!fetched || !canUploadImage(fetched.mime, fetched.bytes)) return [];
    try {
        const id = await uploadChatImage(
            config,
            openId,
            imageFileName(fetched.mime),
            fetched.bytes,
        );
        return [id];
    } catch (error) {
        logger.warn('SnailAI 附图没带上，改走文字', {
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}

async function resolveInboundMedia(message: IncomingMessage, env: Env) {
    let resolved = await resolveOpenClawMedia(message, env);
    if (resolved) {
        await patchInboundMediaPublicUrl(env, message.messageId, {
            publicUrl: resolved.url,
            videoPublicUrl: resolved.videoUrl,
        });
        return resolved;
    }
    if (!message.media && !message.quote?.media) {
        resolved = await findRecentPublicMedia(env, message);
    }
    return resolved;
}

export const snailaiAgentPlugin: Plugin = {
    manifest: {
        name: 'snailai',
        platforms: '*',
        kind: 'agent',
        priority: 100,
        impl: 'local',
    },
    match(message, ctx) {
        if (resolveAgentBrain(ctx.env) !== 'snailai') return false;
        if (!parseBool(ctx.env.XBOT_CHANNEL_ENABLED, false)) return false;
        if (!readSnailAiConfig(ctx.env)) return false;
        if (!message.content?.trim() && !message.quote && !message.media) return false;
        return message.source === 'private' || message.source === 'group';
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const config = readSnailAiConfig(ctx.env);
        if (!config) {
            logger.warn('SnailAI 未配齐，跳过');
            return null;
        }

        try {
            const resolved = await resolveInboundMedia(message, ctx.env);
            const content = await buildInboundContent(message, ctx.env, {
                url: resolved?.url,
                videoUrl: resolved?.videoUrl,
                kind: resolved?.kind,
            });
            const openId = await ensureOpenId(ctx.env, config, message);
            await ensureSubscribed(ctx.env, config, openId);
            const conversationId = await resolveConversationId(ctx.env, message);
            const imageIds = resolved?.kind === 'image' || resolved?.kind === 'emoji'
                ? await maybeUploadImage(config, openId, resolved.url)
                : [];
            const raw = await chatSync(config, openId, conversationId, content, imageIds);
            const answer = sanitizeAnswer(raw);
            if (looksLikeError(answer)) {
                logger.warn('SnailAI 回答不可发', {preview: answer.slice(0, 120)});
                return textReply(friendlyFail());
            }
            const replies = parseRepliesFromText(answer);
            return replies.length ? replies : textReply(friendlyFail());
        } catch (error) {
            logger.warn('SnailAI 对话失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return textReply(friendlyFail());
        }
    },
};
