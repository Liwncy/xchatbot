import type {TextMessage} from '../types.js';
import {NO_PERMISSION_REPLY} from '../../constants/messages.js';
import {logger} from '../../utils/logger.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {generateOriginalLyrics, normalizeLyrics} from './lyrics.js';
import {AI_SING_PRESET_VOICES, buildAiSingBaseConfig, loadAiSingPersistedConfig, loadAiSingRuntimeConfig, maskSensitiveValue, resolveAiSingService, saveAiSingConfig} from './config.js';
import {requestMimoTts} from './mimo-tts-client.js';

const AI_SING_COMMAND_PREFIX = 'AI唱歌';

function isAiSingCommand(content: string): boolean {
    const trimmed = content.trim();
    return trimmed === AI_SING_COMMAND_PREFIX || trimmed.startsWith(`${AI_SING_COMMAND_PREFIX} `);
}

function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return 'BOT_OWNER_WECHAT_ID 未配置，无法使用 AI唱歌 管理命令';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

function unwrapCodeFence(input: string): string {
    const trimmed = input.trim();
    const matched = trimmed.match(/^```(?:json|JSON|txt|text|markdown|md)?\s*([\s\S]*?)```$/u);
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

function parseToggleValue(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (['开', '开启', '打开', '启用', 'on', 'true', '1', 'yes'].includes(normalized)) return true;
    if (['关', '关闭', '禁用', 'off', 'false', '0', 'no'].includes(normalized)) return false;
    throw new Error('开关值仅支持：开/关');
}

function parseStyleTags(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed || ['默认', '空', '清空', '删除'].includes(trimmed)) return [];
    const tags = trimmed.split(/[，,、]/u).map((item) => item.trim()).filter(Boolean);
    return [...new Set(tags)].slice(0, 5);
}

function formatHelpText(): string {
    return [
        'AI唱歌 命令：',
        '- AI唱歌 帮助',
        '- AI唱歌 声音列表',
        '- AI唱歌 唱 你想让它唱的话',
        '- AI唱歌 唱 <<<多行歌词/文案>>>',
        '- AI唱歌 主题 主题/场景描述（让它自己写原创短歌词再唱）',
        '- AI唱歌 试音 一段想朗读的话',
        '',
        '主人管理命令：',
        '- AI唱歌 配置',
        '- AI唱歌 设置开关 开|关',
        '- AI唱歌 设置音色 冰糖/茉莉/苏打/...',
        '- AI唱歌 设置风格 活泼,轻快',
        '- AI唱歌 设置最大字数 120',
        '- AI唱歌 设置单段秒数 25',
        '',
        '说明：',
        '- 「唱」命令默认按你发的内容原样唱，不再自己发挥',
        '- 想让它自己写原创短歌词，请用「AI唱歌 主题 ...」',
        '- 默认人设参考“小聪明儿”：自然、灵动、别太端着',
    ].join('\n');
}

function formatVoiceList(): string {
    return [
        `可用音色（共 ${AI_SING_PRESET_VOICES.length} 个）：`,
        ...AI_SING_PRESET_VOICES.map((voice, index) => `${index + 1}. ${voice}`),
        '',
        '推荐：',
        '- 冰糖：中文女声，最接近“小聪明儿”当前人设',
        '- 茉莉：更柔一点',
        '- 苏打：男声路线',
    ].join('\n');
}

function formatConfigOverview(config: Awaited<ReturnType<typeof loadAiSingRuntimeConfig>>) {
    return [
        'AI唱歌 配置：',
        `- 开关：${config.enabled ? '开启' : '关闭'}`,
        `- 默认音色：${config.default_voice}`,
        `- 默认风格：${config.default_style_tags.length ? config.default_style_tags.join('、') : '(无)'}`,
        `- 最大歌词字数：${config.max_lyrics_chars}`,
        `- 单段目标秒数：${config.target_segment_seconds}`,
        `- 群聊可用：${config.allow_group_use ? '是' : '否'}`,
        `- 私聊可用：${config.allow_private_use ? '是' : '否'}`,
        `- 主题生成：${config.allow_theme_generate ? '开启' : '关闭'}`,
        `- 直接歌词：${config.allow_user_direct_lyrics ? '开启' : '关闭'}`,
        `- 上传音频外链：${config.auto_upload_audio ? '开启' : '关闭'}`,
        `- 服务地址：${config.service.base_url}`,
        `- 模型：${config.service.model}`,
        `- api_key：${maskSensitiveValue(config.service.api_key)}`,
        `- api_key_secret：${config.service.api_key_secret?.trim() || '(未设置)'}`,
    ].join('\n');
}

function ensureSceneAllowed(config: Awaited<ReturnType<typeof loadAiSingRuntimeConfig>>, source?: string) {
    if (source === 'group' && !config.allow_group_use) {
        throw new Error('当前配置未开放群聊使用 AI唱歌');
    }
    if (source !== 'group' && !config.allow_private_use) {
        throw new Error('当前配置未开放私聊使用 AI唱歌');
    }
}

function buildSingInstruction(styleTags: string[]): string {
    const styleText = styleTags.length ? `整体风格偏向：${styleTags.join('、')}。` : '';
    return [
        '请用自然、有人味、别太端着的方式演唱。',
        '像“小聪明儿”在微信里随口唱两句：活泼、机灵、带点灵气，但不要夸张做作。',
        styleText,
        '重视清晰度和情绪，不要唱得太像播音腔。',
    ].join(' ');
}

function buildSpeakInstruction(styleTags: string[]): string {
    const styleText = styleTags.length ? `风格参考：${styleTags.join('、')}。` : '';
    return [
        '请自然朗读，像“小聪明儿”和熟人说话，不要太官方，也不要太夸张。',
        styleText,
        '语气轻松一点，听起来自然、有亲近感。',
    ].join(' ');
}

async function uploadAudioForDelivery(base64Audio: string): Promise<string | undefined> {
    const url = await FileUploader.uploadBase64(base64Audio, {
        fileName: `ai-sing-${Date.now()}.mp3`,
        contentType: 'audio/mpeg',
    });
    return url ?? undefined;
}

async function buildVoiceReply(
    audioBase64: string,
    durationMs: number,
) {
    const deliveryUrl = await uploadAudioForDelivery(audioBase64);
    return {
        type: 'voice' as const,
        mediaId: audioBase64,
        format: 2,
        duration: durationMs,
        ...(deliveryUrl ? {originalUrl: deliveryUrl} : {}),
        fallbackText: '嗓子哑了，不想说话了啦 🙈',
    };
}

async function handleSing(
    message: Parameters<TextMessage['handle']>[0],
    env: Parameters<TextMessage['handle']>[1],
    payload: string,
) {
    const config = await loadAiSingRuntimeConfig(env);
    if (!config.enabled) {
        return {type: 'text' as const, content: 'AI唱歌 目前已关闭。'};
    }
    ensureSceneAllowed(config, message.source);

    const normalizedPayload = unwrapBlockPayload(payload);
    if (!normalizedPayload) {
        throw new Error('请提供想让它唱的内容');
    }

    if (!config.allow_user_direct_lyrics) {
        throw new Error('当前未开放“直接提供歌词”模式');
    }

    const lyrics = normalizeLyrics(normalizedPayload, config.max_lyrics_chars);

    const service = resolveAiSingService(env, config);
    const result = await requestMimoTts({
        apiUrl: service.base_url,
        apiKey: service.resolvedApiKey,
        model: service.model,
        voice: config.default_voice,
        text: lyrics,
        styleTags: config.default_style_tags,
        instruction: buildSingInstruction(config.default_style_tags),
        singing: true,
    });

    return buildVoiceReply(result.audioBase64, result.durationMs);
}

async function handleThemeSing(
    message: Parameters<TextMessage['handle']>[0],
    env: Parameters<TextMessage['handle']>[1],
    payload: string,
) {
    const config = await loadAiSingRuntimeConfig(env);
    if (!config.enabled) {
        return {type: 'text' as const, content: 'AI唱歌 目前已关闭。'};
    }
    ensureSceneAllowed(config, message.source);

    const normalizedPayload = unwrapBlockPayload(payload);
    if (!normalizedPayload) {
        throw new Error('请提供一个主题、情绪或场景');
    }

    if (!config.allow_theme_generate) {
        throw new Error('当前未开放“主题生成歌词”模式');
    }

    const lyrics = await generateOriginalLyrics(env, {
        theme: normalizedPayload,
        maxChars: config.max_lyrics_chars,
        targetSeconds: config.target_segment_seconds,
    });

    const service = resolveAiSingService(env, config);
    const result = await requestMimoTts({
        apiUrl: service.base_url,
        apiKey: service.resolvedApiKey,
        model: service.model,
        voice: config.default_voice,
        text: lyrics,
        styleTags: config.default_style_tags,
        instruction: buildSingInstruction(config.default_style_tags),
        singing: true,
    });

    return buildVoiceReply(result.audioBase64, result.durationMs);
}

async function handleTrialVoice(
    message: Parameters<TextMessage['handle']>[0],
    env: Parameters<TextMessage['handle']>[1],
    payload: string,
) {
    const config = await loadAiSingRuntimeConfig(env);
    if (!config.enabled) {
        return {type: 'text' as const, content: 'AI唱歌 目前已关闭。'};
    }
    ensureSceneAllowed(config, message.source);

    const text = unwrapBlockPayload(payload).trim();
    if (!text) {
        throw new Error('请提供一段想试音的文本');
    }

    const service = resolveAiSingService(env, config);
    const result = await requestMimoTts({
        apiUrl: service.base_url,
        apiKey: service.resolvedApiKey,
        model: service.model,
        voice: config.default_voice,
        text,
        styleTags: config.default_style_tags,
        instruction: buildSpeakInstruction(config.default_style_tags),
        singing: false,
    });

    return buildVoiceReply(result.audioBase64, result.durationMs);
}

async function handleConfigCommand(
    message: Parameters<TextMessage['handle']>[0],
    env: Parameters<TextMessage['handle']>[1],
    body: string,
) {
    const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
    if (ownerErr) {
        return {type: 'text' as const, content: ownerErr};
    }

    const persistedConfig = await loadAiSingPersistedConfig(env);
    const runtimeConfig = persistedConfig ?? (await loadAiSingRuntimeConfig(env));
    const editableConfig = persistedConfig ?? buildAiSingBaseConfig();

    if (body === '配置') {
        return {type: 'text' as const, content: formatConfigOverview(runtimeConfig)};
    }

    if (body.startsWith('设置开关 ')) {
        editableConfig.enabled = parseToggleValue(body.replace(/^设置开关\s+/u, '').trim());
        await saveAiSingConfig(env, editableConfig);
        return {type: 'text' as const, content: `已${editableConfig.enabled ? '开启' : '关闭'} AI唱歌。`};
    }

    if (body.startsWith('设置音色 ')) {
        const voice = body.replace(/^设置音色\s+/u, '').trim();
        if (!AI_SING_PRESET_VOICES.includes(voice as typeof AI_SING_PRESET_VOICES[number])) {
            throw new Error(`不支持的音色：${voice}，可发送「AI唱歌 声音列表」查看可选项`);
        }
        editableConfig.default_voice = voice;
        await saveAiSingConfig(env, editableConfig);
        return {type: 'text' as const, content: `已设置默认音色为：${voice}`};
    }

    if (body.startsWith('设置风格 ')) {
        const tags = parseStyleTags(body.replace(/^设置风格\s+/u, '').trim());
        editableConfig.default_style_tags = tags.length ? tags : buildAiSingBaseConfig().default_style_tags;
        await saveAiSingConfig(env, editableConfig);
        return {type: 'text' as const, content: `已设置默认风格为：${editableConfig.default_style_tags.join('、')}`};
    }

    if (body.startsWith('设置最大字数 ')) {
        const raw = body.replace(/^设置最大字数\s+/u, '').trim();
        if (!/^\d+$/u.test(raw)) throw new Error('最大字数必须是大于 0 的整数');
        const value = Number.parseInt(raw, 10);
        if (value <= 0) throw new Error('最大字数必须是大于 0 的整数');
        editableConfig.max_lyrics_chars = value;
        await saveAiSingConfig(env, editableConfig);
        return {type: 'text' as const, content: `已设置最大歌词字数为：${value}`};
    }

    if (body.startsWith('设置单段秒数 ')) {
        const raw = body.replace(/^设置单段秒数\s+/u, '').trim();
        if (!/^\d+$/u.test(raw)) throw new Error('单段秒数必须是大于 0 的整数');
        const value = Number.parseInt(raw, 10);
        if (value <= 0) throw new Error('单段秒数必须是大于 0 的整数');
        editableConfig.target_segment_seconds = value;
        await saveAiSingConfig(env, editableConfig);
        return {type: 'text' as const, content: `已设置单段目标时长为：${value} 秒`};
    }

    return {type: 'text' as const, content: formatHelpText()};
}

export const aiSingPlugin: TextMessage = {
    type: 'text',
    name: 'ai-sing',
    description: '支持原创短唱段与 MiMo TTS 语音试音',
    match: (content) => isAiSingCommand(content),
    handle: async (message, env) => {
        const content = (message.content ?? '').trim();
        const body = content.slice(AI_SING_COMMAND_PREFIX.length).trim();

        try {
            if (!body || body === '帮助') {
                return {type: 'text' as const, content: formatHelpText()};
            }
            if (body === '声音列表' || body === '音色列表') {
                return {type: 'text' as const, content: formatVoiceList()};
            }
            if (body.startsWith('唱 ')) {
                return await handleSing(message, env, body.replace(/^唱\s+/u, ''));
            }
            if (body.startsWith('主题 ')) {
                return await handleThemeSing(message, env, body.replace(/^主题\s+/u, ''));
            }
            if (body.startsWith('试音 ')) {
                return await handleTrialVoice(message, env, body.replace(/^试音\s+/u, ''));
            }
            return await handleConfigCommand(message, env, body);
        } catch (error) {
            logger.warn('AI唱歌 命令执行失败', {
                content,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text' as const,
                content: `AI唱歌 执行失败：${error instanceof Error ? error.message : String(error)}`,
            };
        }
    },
};


