import type {TextMessage} from '../../types.js';
import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {MessageHandlerContext} from '../../../types/plugin.js';
import {setChatLogHandleMeta} from '../../../chat-log/index.js';
import {logger} from '../../../utils/logger.js';
import {ensureOwner} from '../../system/message-revoke/service.js';
import {loadAgentBridgeRuntimeConfig} from './config.js';
import {deliverAgentBridgeTextReply, formatAgentBridgeError} from './deliver.js';
import {requestOpenClawChat} from './openclaw-client.js';
import {
    buildAgentBridgeSessionKey,
    buildAgentBridgeUserId,
    loadAgentBridgeSession,
    saveAgentBridgeSession,
} from './session.js';

const AGENT_HELP_ALIASES = ['聪明办事帮助', '聪明办事 帮助', '聪明办事help'] as const;
const AGENT_COMMAND_PATTERN = /^(?:@?\s*小聪明儿[\s,，:：-]*)?聪明办事/u;

function ensureAgentBridgeOwner(messageFrom: string, ownerWxid?: string): string | null {
    return ensureOwner(messageFrom, ownerWxid);
}

function isAgentHelpCommand(content: string): boolean {
    const trimmed = content.trim();
    return AGENT_HELP_ALIASES.some((alias) => trimmed.toLowerCase() === alias.toLowerCase());
}

export function isAgentBridgeTrigger(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;
    if (isAgentHelpCommand(trimmed)) return true;
    return AGENT_COMMAND_PATTERN.test(trimmed);
}

function stripAgentTrigger(content: string): string {
    const trimmed = content.trim();
    const withoutBot = trimmed.replace(/^@?\s*小聪明儿[\s,，:：-]*/iu, '').trim();
    return withoutBot.replace(/^聪明办事[\s,，:：-]*/u, '').trim();
}

function buildHelpText(): string {
    return [
        '聪明办事（主人专用）：',
        '· @小聪明儿 聪明办事 你的任务',
        '· 聪明办事 你的任务（私聊也行）',
        '',
        '例子：',
        '· 聪明办事 看看整点啊为啥没触发',
        '· 聪明办事 给 agent-bridge 补条测试思路',
        '',
        '发完我等结果好了再回你，中间不会先吭声。',
    ].join('\n');
}

async function runAgentBridgeTask(
    message: IncomingMessage,
    env: Env,
    prompt: string,
): Promise<void> {
    const config = await loadAgentBridgeRuntimeConfig(env);
    if (!config) {
        await deliverAgentBridgeTextReply(message, env, '办事那边还没接上，主人先去配好 🙏');
        return;
    }

    const sessionKey = buildAgentBridgeSessionKey(message);
    const userId = buildAgentBridgeUserId(sessionKey);
    const session = await loadAgentBridgeSession(env.XBOT_KV, sessionKey);

    try {
        const result = await requestOpenClawChat(config, {
            userId,
            prompt,
            conversationId: session?.conversationId,
        });

        if (result.conversationId) {
            await saveAgentBridgeSession(env.XBOT_KV, sessionKey, {
                conversationId: result.conversationId,
                updatedAt: Date.now(),
            }, config.sessionTtlSec);
        }

        await deliverAgentBridgeTextReply(message, env, result.content);
    } catch (error) {
        logger.warn('Agent 桥接任务失败', {
            sessionKey,
            error: error instanceof Error ? error.message : String(error),
        });
        await deliverAgentBridgeTextReply(message, env, formatAgentBridgeError(error));
    }
}

async function handleAgentBridgeCommand(
    message: IncomingMessage,
    env: Env,
    handlerContext?: MessageHandlerContext,
): Promise<ReturnType<TextMessage['handle']>> {
    const content = (message.content ?? '').trim();
    const ownerErr = ensureAgentBridgeOwner(message.from, env.BOT_OWNER_WECHAT_ID);
    if (ownerErr) {
        return {type: 'text', content: ownerErr};
    }

    if (isAgentHelpCommand(content)) {
        return {type: 'text', content: buildHelpText()};
    }

    const config = await loadAgentBridgeRuntimeConfig(env);
    if (!config) {
        return {
            type: 'text',
            content: '办事那边还没接上，主人先去配好 👌',
        };
    }

    const prompt = stripAgentTrigger(content);
    if (!prompt) {
        return {
            type: 'text',
            content: '你想让我办啥？比如：聪明办事 查一下整点啊为啥没触发',
        };
    }

    const task = runAgentBridgeTask(message, env, prompt);
    if (handlerContext?.waitUntil) {
        handlerContext.waitUntil(task);
        return null;
    }

    try {
        await task;
        return null;
    } catch (error) {
        return {type: 'text', content: formatAgentBridgeError(error)};
    }
}

export const agentBridgePlugin: TextMessage = {
    type: 'text',
    name: 'agent-bridge',
    description: '聪明办事：转发任务到 OpenClaw Gateway（主人专用）',

    match: (content) => isAgentBridgeTrigger(content),

    handle: async (message, env, handlerContext) => {
        const result = await handleAgentBridgeCommand(message, env, handlerContext);
        setChatLogHandleMeta(message, {pluginName: 'agent-bridge'});
        return result;
    },
};
