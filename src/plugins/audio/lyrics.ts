import type {Env} from '../../types/message.js';
import {requestAiText} from '../common/ai-client.js';
import {loadAiDialogRuntimeConfig, resolveAiDialogService} from '../ai/config.js';

export interface GenerateOriginalLyricsOptions {
    theme: string;
    maxChars: number;
    targetSeconds: number;
}

function unwrapCodeFence(input: string): string {
    const trimmed = input.trim();
    const matched = trimmed.match(/^```(?:text|txt|markdown|md)?\s*([\s\S]*?)```$/iu);
    return matched ? matched[1].trim() : trimmed;
}

export function normalizeLyrics(input: string, maxChars: number): string {
    const normalized = unwrapCodeFence(input)
        .replace(/^歌词[：:]?/u, '')
        .split(/\r?\n/u)
        .map((line) => line.replace(/^[-*•\d.、\s]+/u, '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();

    if (!normalized) {
        throw new Error('歌词不能为空');
    }

    return normalized.length > maxChars ? normalized.slice(0, maxChars).trim() : normalized;
}

export function looksLikeDirectLyrics(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;
    if (/\r?\n/u.test(trimmed)) return true;
    return /[，。！？!?]/u.test(trimmed) && trimmed.length >= 18;
}

async function resolveLyricService(env: Env) {
    const dialogConfig = await loadAiDialogRuntimeConfig(env);
    const dialogService = resolveAiDialogService(env, dialogConfig);
    return {
        apiUrl: dialogService.base_url,
        apiKey: dialogService.resolvedApiKey,
        model: dialogService.model,
    };
}

export async function generateOriginalLyrics(env: Env, options: GenerateOriginalLyricsOptions): Promise<string> {
    const theme = options.theme.trim();
    if (!theme) {
        throw new Error('请提供一个想唱的主题或场景');
    }

    const service = await resolveLyricService(env);
    const prompt = [
        '你要帮一个叫“小聪明儿”的女生写一小段适合在微信里随口清唱的原创短歌词。',
        '她 18 岁，机灵、活泼、自然，不要写得像诗朗诵或广告文案，要像她带点情绪、轻轻哼出来的几句。',
        `总字数控制在 ${options.maxChars} 字以内，最好 4 到 8 行，约 ${options.targetSeconds} 秒内能唱完。`,
        '语言要口语一点，有画面感，但不要堆砌华丽词藻，不要太生硬。',
        '不要引用现有歌曲歌词，不要模仿真实歌手，不要输出标题、说明、括号注释，只输出纯歌词。',
    ].join('\n');

    const reply = await requestAiText(env, {
        apiUrl: service.apiUrl,
        apiKey: service.apiKey,
        model: service.model,
        input: theme,
        systemPrompt: prompt,
        messages: [{role: 'user', content: `主题：${theme}`}],
    });

    if (!reply?.trim()) {
        throw new Error('写词服务没有返回可用内容');
    }

    return normalizeLyrics(reply, options.maxChars);
}

