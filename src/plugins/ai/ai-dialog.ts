import type {TextMessage} from '../types.js';
import {NO_PERMISSION_REPLY} from '../../constants/messages.js';
import {logger} from '../../utils/logger.js';
import {requestAiText} from '../common/ai-client.js';
import {
    AI_DIALOG_DEFAULT_PROMPT_KEY,
    buildAiDialogBaseConfig,
    buildServicePatch,
    clearAiDialogHistory,
    getAiDialogPrompt,
    listSortedKeys,
    loadAiDialogHistory,
    loadAiDialogPersistedConfig,
    loadAiDialogRuntimeConfig,
    maskSensitiveValue,
    mergeAiDialogService,
    resolveAiDialogService,
    saveAiDialogConfig,
    saveAiDialogHistory,
} from './config.js';

const AI_DIALOG_COMMAND_PREFIX = 'AI对话';
const AI_DIALOG_TRIGGER_NAME = '小聪明儿';

function isAiDialogCommand(content: string): boolean {
    const trimmed = content.trim();
    return trimmed === AI_DIALOG_COMMAND_PREFIX || trimmed.startsWith(`${AI_DIALOG_COMMAND_PREFIX} `);
}

function ensureAiDialogCommandOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return 'BOT_OWNER_WECHAT_ID 未配置，无法使用 AI 对话配置命令';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

function splitFirstToken(input: string): {token: string; rest: string} {
    const trimmed = input.trim();
    if (!trimmed) return {token: '', rest: ''};
    const matched = trimmed.match(/^(\S+)([\s\S]*)$/u);
    if (!matched) return {token: '', rest: ''};
    return {
        token: matched[1],
        rest: matched[2].trimStart(),
    };
}

function unwrapCodeFence(input: string): string {
    const trimmed = input.trim();
    const matched = trimmed.match(/^```(?:json|JSON|txt|text)?\s*([\s\S]*?)```$/u);
    return matched ? matched[1].trim() : trimmed;
}

function unwrapBlockPayload(input: string): string {
    const trimmed = unwrapCodeFence(input).trim();
    if (!trimmed.startsWith('<<<')) return trimmed;

    const withoutStart = trimmed.slice(3).replace(/^\s*\r?\n/u, '');
    const endIndex = withoutStart.lastIndexOf('>>>');
    if (endIndex < 0) {
        throw new Error('多行内容缺少结束标记 >>>');
    }
    return withoutStart.slice(0, endIndex).trim();
}

function normalizeServiceFieldName(fieldName: string): 'base_url' | 'model' | 'api_key' | 'api_key_secret' {
    const normalized = fieldName.trim().toLowerCase();
    switch (normalized) {
        case 'base_url':
        case 'baseurl':
        case 'url':
        case '地址':
            return 'base_url';
        case 'model':
        case '模型':
            return 'model';
        case 'api_key':
        case 'apikey':
        case 'key':
            return 'api_key';
        case 'api_key_secret':
        case 'apikeysecret':
        case 'api密钥变量':
        case 'secret':
            return 'api_key_secret';
        default:
            throw new Error(`不支持的服务字段：${fieldName}`);
    }
}

function parseServicePatchPayload(payload: string) {
    const normalized = unwrapBlockPayload(payload);
    if (!normalized) {
        throw new Error('缺少服务配置内容');
    }

    if (normalized.startsWith('{')) {
        try {
            const parsed = JSON.parse(normalized) as unknown;
            return buildServicePatch(parsed);
        } catch (error) {
            throw new Error(`服务 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const fields: Record<string, string | null> = {};
    for (const line of normalized.split(/\r?\n/u)) {
        if (!line.trim()) continue;
        const matched = line.match(/^([^：:]+)[：:]\s*([\s\S]*)$/u);
        if (!matched) {
            throw new Error(`字段格式错误：${line}`);
        }
        fields[normalizeServiceFieldName(matched[1])] = matched[2].trim() || null;
    }

    return buildServicePatch(fields);
}

function extractPromptPayload(payload: string): string {
    const normalized = unwrapBlockPayload(payload);
    if (!normalized) {
        throw new Error('提示词内容不能为空');
    }
    return normalized;
}

function formatPromptPreview(prompt: string, maxLength = 40): string {
    const normalized = prompt.replace(/\s+/gu, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
}

function summarizeAuth(service: {api_key?: string; api_key_secret?: string}): string {
    if (service.api_key?.trim()) return '直填 api_key';
    if (service.api_key_secret?.trim()) return `secret:${service.api_key_secret.trim()}`;
    return '无认证';
}

function formatConfigOverview(
    config: Awaited<ReturnType<typeof loadAiDialogRuntimeConfig>>,
    hasPersistedConfig: boolean,
): string {
    const serviceKeys = listSortedKeys(config.services);
    const promptKeys = listSortedKeys(config.prompts);
    const lines = [
        'AI 对话配置：',
        `- 默认服务：${config.default_service || '(未设置)'}`,
        `- 默认提示词：${config.default_prompt_key}`,
        `- 最大记忆轮数：${config.max_history_count}（0 表示不保存）`,
        `- 服务数量：${serviceKeys.length}`,
        `- 提示词数量：${promptKeys.length}`,
        `- 服务列表：${serviceKeys.length ? serviceKeys.join('、') : '(暂无)'}`,
        `- 提示词列表：${promptKeys.length ? promptKeys.join('、') : '(暂无)'}`,
    ];

    if (!hasPersistedConfig && config.default_service === 'env-default') {
        lines.push('- 当前运行时使用环境变量 AI_API_URL / AI_MODEL / AI_API_KEY 回退，尚未写入 KV');
    }

    return lines.join('\n');
}

function formatServiceList(config: Awaited<ReturnType<typeof loadAiDialogRuntimeConfig>>): string {
    const keys = listSortedKeys(config.services);
    if (!keys.length) {
        return '当前还没有可用服务，请先发送「AI对话 服务新增 服务名 ...」';
    }

    return [
        `服务列表（共 ${keys.length} 个）：`,
        ...keys.map((key, index) => {
            const service = config.services[key];
            const defaultTag = key === config.default_service ? ' [默认]' : '';
            return `${index + 1}. ${key}${defaultTag}\n   - model: ${service.model}\n   - url: ${service.base_url}\n   - auth: ${summarizeAuth(service)}`;
        }),
    ].join('\n');
}

function formatPromptList(config: Awaited<ReturnType<typeof loadAiDialogRuntimeConfig>>): string {
    const keys = listSortedKeys(config.prompts);
    return [
        `提示词列表（共 ${keys.length} 个）：`,
        ...keys.map((key, index) => {
            const defaultTag = key === config.default_prompt_key ? ' [默认]' : '';
            return `${index + 1}. ${key}${defaultTag} - ${formatPromptPreview(config.prompts[key])}`;
        }),
    ].join('\n');
}

function formatServiceDetail(
    key: string,
    config: Awaited<ReturnType<typeof loadAiDialogRuntimeConfig>>,
    env: Parameters<TextMessage['handle']>[1],
): string {
    const service = config.services[key];
    if (!service) {
        throw new Error(`服务不存在：${key}`);
    }

    let resolvedStatus = '未解析';
    if (service.api_key?.trim()) {
        resolvedStatus = '使用配置内 api_key';
    } else if (service.api_key_secret?.trim()) {
        const hasSecret = Boolean((env as unknown as Record<string, unknown>)[service.api_key_secret.trim()]);
        resolvedStatus = hasSecret ? '已找到对应 secret' : '未找到对应 secret';
    } else {
        resolvedStatus = '无需认证';
    }

    return [
        `服务详情：${key}${key === config.default_service ? ' [默认]' : ''}`,
        `- base_url：${service.base_url}`,
        `- model：${service.model}`,
        `- api_key：${maskSensitiveValue(service.api_key)}`,
        `- api_key_secret：${service.api_key_secret?.trim() || '(未设置)'}`,
        `- 鉴权说明：${resolvedStatus}`,
    ].join('\n');
}

function formatPromptDetail(key: string, config: Awaited<ReturnType<typeof loadAiDialogRuntimeConfig>>): string {
    const prompt = config.prompts[key];
    if (!prompt) {
        throw new Error(`提示词不存在：${key}`);
    }

    return [
        `提示词详情：${key}${key === config.default_prompt_key ? ' [默认]' : ''}`,
        '---',
        prompt,
        '---',
    ].join('\n');
}

function buildHelpText(): string {
    return [
        'AI 对话命令：',
        '- AI对话 配置',
        '- AI对话 切换服务 服务名',
        '- AI对话 切换模型 服务名（模型跟随服务切换）',
        '- AI对话 切换提示词 提示词名',
        '- AI对话 设置记忆 数字（0 表示不保存）',
        '- AI对话 清空记忆',
        '- AI对话 服务列表 / 服务查看 服务名 / 服务删除 服务名',
        '- AI对话 服务新增 服务名 {json}',
        '- AI对话 服务修改 服务名 {json}',
        '- AI对话 提示词列表 / 提示词查看 名称 / 提示词删除 名称',
        '- AI对话 提示词新增 名称 内容',
        '- AI对话 提示词修改 名称 内容',
        '',
        '服务字段支持：base_url、model、api_key、api_key_secret',
        '示例：',
        'AI对话 服务新增 moonshot {"base_url":"https://api.moonshot.cn/v1/chat/completions","model":"moonshot-v1-8k","api_key_secret":"MOONSHOT_API_KEY"}',
        'AI对话 提示词新增 xcmer 你是一个十八岁的活泼开朗的女生，你的名字叫“小聪明儿”。',
        'AI对话 切换服务 moonshot',
        'AI对话 设置记忆 6',
        '普通对话示例：小聪明儿，今天心情怎么样？',
    ].join('\n');
}

function extractUserPrompt(content: string): string {
    const trimmed = content.trim();
    const withoutLeadingTrigger = trimmed.replace(/^@?小聪明儿[\s,，:：-]*/u, '').trim();
    return withoutLeadingTrigger || trimmed;
}

function getConversationSpeaker(message: Parameters<TextMessage['handle']>[0]): string {
    const displayName = message.senderName?.trim();
    if (displayName) return displayName;
    return message.from.trim() || '未知成员';
}

function buildAiUserMessage(message: Parameters<TextMessage['handle']>[0], prompt: string): string {
    const speaker = getConversationSpeaker(message);
    if (message.room?.id?.trim()) {
        return `群成员「${speaker}」说：${prompt}`;
    }
    return `用户「${speaker}」说：${prompt}`;
}

async function handleAiDialogCommand(message: Parameters<TextMessage['handle']>[0], env: Parameters<TextMessage['handle']>[1]) {
    const content = (message.content ?? '').trim();
    const body = content.slice(AI_DIALOG_COMMAND_PREFIX.length).trim();
    const ownerErr = ensureAiDialogCommandOwner(message.from, env.BOT_OWNER_WECHAT_ID);
    if (ownerErr) {
        return {type: 'text' as const, content: ownerErr};
    }
    const persistedConfig = await loadAiDialogPersistedConfig(env);
    const runtimeConfig = persistedConfig ?? (await loadAiDialogRuntimeConfig(env));
    const editableConfig = persistedConfig ?? buildAiDialogBaseConfig(env);

    try {
        if (!body || body === '帮助') {
            return {type: 'text' as const, content: buildHelpText()};
        }

        if (body === '配置' || body === '状态') {
            return {
                type: 'text' as const,
                content: formatConfigOverview(runtimeConfig, Boolean(persistedConfig)),
            };
        }

        if (body === '清空记忆' || body === '重置记忆') {
            await clearAiDialogHistory(env, message);
            return {type: 'text' as const, content: '已清空当前会话的 AI 记忆。'};
        }

        if (body.startsWith('切换服务 ') || body.startsWith('切换模型 ')) {
            const key = body.replace(/^切换(?:服务|模型)\s+/u, '').trim();
            if (!key) throw new Error('请提供要切换的服务名');
            if (!editableConfig.services[key]) throw new Error(`服务不存在：${key}`);
            editableConfig.default_service = key;
            await saveAiDialogConfig(env, editableConfig);
            return {type: 'text' as const, content: `已切换默认服务为：${key}`};
        }

        if (body.startsWith('切换提示词 ')) {
            const key = body.replace(/^切换提示词\s+/u, '').trim();
            if (!key) throw new Error('请提供要切换的提示词名');
            if (!editableConfig.prompts[key]) throw new Error(`提示词不存在：${key}`);
            editableConfig.default_prompt_key = key;
            await saveAiDialogConfig(env, editableConfig);
            return {type: 'text' as const, content: `已切换默认提示词为：${key}`};
        }

        if (body.startsWith('设置记忆 ')) {
            const rawCount = body.replace(/^设置记忆\s+/u, '').trim();
            if (!/^\d+$/u.test(rawCount)) {
                throw new Error('记忆条数必须是大于等于 0 的整数');
            }
            editableConfig.max_history_count = Number.parseInt(rawCount, 10);
            await saveAiDialogConfig(env, editableConfig);
            if (editableConfig.max_history_count === 0) {
                await clearAiDialogHistory(env, message);
            }
            return {
                type: 'text' as const,
                content: `已设置最大记忆轮数为：${editableConfig.max_history_count}${editableConfig.max_history_count === 0 ? '（已关闭记忆保存）' : ''}`,
            };
        }

        if (body === '服务列表') {
            return {type: 'text' as const, content: formatServiceList(runtimeConfig)};
        }

        if (body === '提示词列表') {
            return {type: 'text' as const, content: formatPromptList(runtimeConfig)};
        }

        if (body.startsWith('服务查看 ')) {
            const key = body.replace(/^服务查看\s+/u, '').trim();
            return {type: 'text' as const, content: formatServiceDetail(key, runtimeConfig, env)};
        }

        if (body.startsWith('提示词查看 ')) {
            const key = body.replace(/^提示词查看\s+/u, '').trim();
            return {type: 'text' as const, content: formatPromptDetail(key, runtimeConfig)};
        }

        if (body.startsWith('服务删除 ')) {
            const key = body.replace(/^服务删除\s+/u, '').trim();
            if (!editableConfig.services[key]) throw new Error(`服务不存在：${key}`);
            delete editableConfig.services[key];
            if (editableConfig.default_service === key) {
                editableConfig.default_service = listSortedKeys(editableConfig.services)[0] ?? '';
            }
            await saveAiDialogConfig(env, editableConfig);
            return {type: 'text' as const, content: `已删除服务：${key}`};
        }

        if (body.startsWith('提示词删除 ')) {
            const key = body.replace(/^提示词删除\s+/u, '').trim();
            if (key === AI_DIALOG_DEFAULT_PROMPT_KEY) {
                throw new Error('default 提示词作为兜底项不可删除，你可以直接修改它');
            }
            if (!editableConfig.prompts[key]) throw new Error(`提示词不存在：${key}`);
            delete editableConfig.prompts[key];
            if (editableConfig.default_prompt_key === key) {
                editableConfig.default_prompt_key = listSortedKeys(editableConfig.prompts)[0] ?? AI_DIALOG_DEFAULT_PROMPT_KEY;
            }
            await saveAiDialogConfig(env, editableConfig);
            return {type: 'text' as const, content: `已删除提示词：${key}`};
        }

        if (body.startsWith('服务新增 ') || body.startsWith('服务修改 ')) {
            const isCreate = body.startsWith('服务新增 ');
            const payloadText = body.replace(/^服务(?:新增|修改)\s+/u, '');
            const {token: key, rest} = splitFirstToken(payloadText);
            if (!key) throw new Error('请先提供服务名');
            if (!rest.trim()) throw new Error('请提供服务配置内容');
            if (isCreate && editableConfig.services[key]) {
                throw new Error(`服务已存在：${key}，请改用“服务修改”`);
            }
            if (!isCreate && !editableConfig.services[key]) {
                throw new Error(`服务不存在：${key}，请先新增`);
            }
            const patch = parseServicePatchPayload(rest);
            editableConfig.services[key] = mergeAiDialogService(editableConfig.services[key], patch);
            if (!editableConfig.default_service) {
                editableConfig.default_service = key;
            }
            await saveAiDialogConfig(env, editableConfig);
            return {
                type: 'text' as const,
                content: `${isCreate ? '已新增' : '已更新'}服务：${key}\n${formatServiceDetail(key, editableConfig, env)}`,
            };
        }

        if (body.startsWith('提示词新增 ') || body.startsWith('提示词修改 ')) {
            const isCreate = body.startsWith('提示词新增 ');
            const payloadText = body.replace(/^提示词(?:新增|修改)\s+/u, '');
            const {token: key, rest} = splitFirstToken(payloadText);
            if (!key) throw new Error('请先提供提示词名');
            if (!rest.trim()) throw new Error('请提供提示词内容');
            if (isCreate && editableConfig.prompts[key]) {
                throw new Error(`提示词已存在：${key}，请改用“提示词修改”`);
            }
            if (!isCreate && !editableConfig.prompts[key]) {
                throw new Error(`提示词不存在：${key}，请先新增`);
            }
            editableConfig.prompts[key] = extractPromptPayload(rest);
            if (!editableConfig.default_prompt_key) {
                editableConfig.default_prompt_key = key;
            }
            await saveAiDialogConfig(env, editableConfig);
            return {
                type: 'text' as const,
                content: `${isCreate ? '已新增' : '已更新'}提示词：${key}\n预览：${formatPromptPreview(editableConfig.prompts[key], 80)}`,
            };
        }

        return {type: 'text' as const, content: buildHelpText()};
    } catch (error) {
        logger.warn('AI 对话命令执行失败', {
            content,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            type: 'text' as const,
            content: `AI 对话配置操作失败：${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

async function handleAiDialogChat(message: Parameters<TextMessage['handle']>[0], env: Parameters<TextMessage['handle']>[1]) {
    const runtimeConfig = await loadAiDialogRuntimeConfig(env);
    const prompt = extractUserPrompt(message.content ?? '');
    if (!prompt) {
        return {
            type: 'text' as const,
            content: '你可以直接这样和我说：小聪明儿，帮我总结一下今天的重点。',
        };
    }

    let service;
    try {
        service = resolveAiDialogService(env, runtimeConfig);
    } catch (error) {
        logger.warn('AI 对话服务解析失败', {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            type: 'text' as const,
            content: `AI 对话暂未配置完成：${error instanceof Error ? error.message : String(error)}\n可发送「AI对话 帮助」查看配置命令。`,
        };
    }

    const systemPrompt = getAiDialogPrompt(runtimeConfig);
    const userContent = buildAiUserMessage(message, prompt);
    const history = runtimeConfig.max_history_count > 0 ? await loadAiDialogHistory(env, message) : [];
    const messages = [...history, {role: 'user' as const, content: userContent}];

    try {
        const reply = await requestAiText(env, {
            apiUrl: service.base_url,
            apiKey: service.resolvedApiKey,
            input: userContent,
            messages,
            model: service.model,
            systemPrompt,
        });

        if (!reply) {
            logger.warn('AI 服务未返回可用内容', {
                prompt,
                service: service.key,
                url: service.base_url,
            });
            return {
                type: 'text' as const,
                content: '我刚刚没想好怎么回复你，要不换个说法再试试？',
            };
        }

        if (runtimeConfig.max_history_count > 0) {
            await saveAiDialogHistory(env, message, [...history, {role: 'user', content: userContent}, {role: 'assistant', content: reply}], runtimeConfig.max_history_count);
        } else {
            await clearAiDialogHistory(env, message);
        }

        return {type: 'text' as const, content: reply};
    } catch (err) {
        logger.error('调用 AI 服务时发生异常', {
            service: service.key,
            url: service.base_url,
            error: err instanceof Error ? err.message : String(err),
        });
        return {
            type: 'text' as const,
            content: 'AI 服务暂时不可用，请稍后再试。',
        };
    }
}

/**
 * AI 对话插件。
 *
 * 当文本包含"小聪明儿"时触发，将用户文本转发到可配置的 AI 接口并以生成内容回复。
 */
export const aiDialogPlugin: TextMessage = {
    type: 'text',
    name: 'ai-dialog',
    description: '支持“小聪明儿”对话及 AI 服务 / 提示词 / 记忆管理',

    match: (content) => isAiDialogCommand(content) || content.includes(AI_DIALOG_TRIGGER_NAME),

    handle: async (message, env) => isAiDialogCommand(message.content ?? '')
        ? handleAiDialogCommand(message, env)
        : handleAiDialogChat(message, env),
};
