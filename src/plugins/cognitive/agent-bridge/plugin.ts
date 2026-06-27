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

const AGENT_HELP_ALIASES = ['agent帮助', 'agent 帮助', 'agent help', 'Agent帮助'] as const;
const AGENT_COMMAND_PATTERN = /^(?:@?\s*小聪明儿[\s,，:：-]*)?agent\b/iu;

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
    return withoutBot.replace(/^agent[\s,，:：-]*/iu, '').trim();
}

function buildHelpText(): string {
    return [
        'Agent 用法（主人专用）：',
        '· @小聪明儿 agent 你的任务',
        '· agent 你的任务（私聊也行）',
        '',
        '例子：',
        '· agent 看看 rule-engine 为啥整点啊没触发',
        '· agent 给 agent-bridge 补一条单元测试思路',
        '',
        '我会先回一句「稍等」，好了再发结果。',
        '本机要开着 OpenClaw Gateway，并配好 AGENT_BRIDGE_BASE_URL / TOKEN。',
    ].join('\n');
}

async function runAgentBridgeTask(
    message: IncomingMessage,
    env: Env,
    prompt: string,
): Promise<void> {
    const config = await loadAgentBridgeRuntimeConfig(env);
    if (!config) {
        await deliverAgentBridgeTextReply(message, env, 'Agent 还没接上，主人先去配 AGENT_BRIDGE_BASE_URL 和 TOKEN');
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
            content: 'Agent 还没接上。先在 wrangler secret 里配 AGENT_BRIDGE_BASE_URL 和 AGENT_BRIDGE_TOKEN 👌',
        };
    }

    const prompt = stripAgentTrigger(content);
    if (!prompt) {
        return {
            type: 'text',
            content: '你想让我帮你办啥？比如：agent 查一下 simple 规则为啥没触发',
        };
    }

    const task = runAgentBridgeTask(message, env, prompt);
    if (handlerContext?.waitUntil) {
        handlerContext.waitUntil(task);
        return {type: 'text', content: '行，我先看着，好了跟你说 🙏'};
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
    description: '转发 Agent 任务到 OpenClaw Gateway（主人专用）',

    match: (content) => isAgentBridgeTrigger(content),

    handle: async (message, env, handlerContext) => {
        const result = await handleAgentBridgeCommand(message, env, handlerContext);
        if (result) {
            setChatLogHandleMeta(message, {pluginName: 'agent-bridge'});
        }
        return result;
    },
};
