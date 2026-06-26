import type {Env} from '../../../types/env.js';
import {requestAgnesTextCompletion} from '../agnes-text/client.js';
import {resolveAgnesTextConfig} from '../agnes-text/config.js';

export interface GenerateOriginalLyricsOptions {
    theme: string;
    maxChars: number;
    targetSeconds: number;
}

const SAFE_SINGING_MS_PER_CHAR = 430;
const MIN_SAFE_LYRICS_CHARS = 24;

function unwrapCodeFence(input: string): string {
    const trimmed = input.trim();
    const matched = trimmed.match(/^```(?:text|txt|markdown|md)?\s*([\s\S]*?)```$/iu);
    return matched ? matched[1].trim() : trimmed;
}

function countVisibleChars(input: string): number {
    return input.replace(/\s+/gu, '').length;
}

function computeSafeLyricsChars(maxChars: number, targetSeconds?: number): number {
    const normalizedMaxChars = Math.max(1, Math.floor(maxChars));
    if (!Number.isFinite(targetSeconds) || !targetSeconds || targetSeconds <= 0) {
        return normalizedMaxChars;
    }
    const durationLimitedChars = Math.max(MIN_SAFE_LYRICS_CHARS, Math.floor((targetSeconds * 1000) / SAFE_SINGING_MS_PER_CHAR));
    return Math.max(1, Math.min(normalizedMaxChars, durationLimitedChars));
}

function truncateLyricsByVisibleChars(input: string, maxVisibleChars: number): string {
    let visibleChars = 0;
    let output = '';
    for (const char of input) {
        const isWhitespace = /\s/u.test(char);
        if (!isWhitespace) {
            if (visibleChars >= maxVisibleChars) break;
            visibleChars += 1;
        }
        output += char;
    }
    return output.trim();
}

export function normalizeLyrics(input: string, maxChars: number, targetSeconds?: number): string {
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

    const safeChars = computeSafeLyricsChars(maxChars, targetSeconds);
    if (countVisibleChars(normalized) <= safeChars) {
        return normalized;
    }
    return truncateLyricsByVisibleChars(normalized, safeChars);
}

export function looksLikeDirectLyrics(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;
    if (/\r?\n/u.test(trimmed)) return true;
    return /[，。！？!?]/u.test(trimmed) && trimmed.length >= 18;
}

export async function generateOriginalLyrics(env: Env, options: GenerateOriginalLyricsOptions): Promise<string> {
    const theme = options.theme.trim();
    if (!theme) {
        throw new Error('请提供一个想唱的主题或场景');
    }

    const agnesConfig = resolveAgnesTextConfig(env);
    if (!agnesConfig) {
        throw new Error('当前环境未配置 AGNES_API_KEY，无法使用主题写词模式');
    }

    const prompt = [
        '你要帮一个叫“小聪明儿”的女生写一小段适合在微信里随口清唱的原创短歌词。',
        '她 18 岁，机灵、活泼、自然，不要写得像诗朗诵或广告文案，要像她带点情绪、轻轻哼出来的几句。',
        `总字数控制在 ${computeSafeLyricsChars(options.maxChars, options.targetSeconds)} 字以内，最好 4 到 8 行，约 ${options.targetSeconds} 秒内能唱完。`,
        '语言要口语一点，有画面感，但不要堆砌华丽词藻，不要太生硬。',
        '不要引用现有歌曲歌词，不要模仿真实歌手，不要输出标题、说明、括号注释，只输出纯歌词。',
    ].join('\n');

    const reply = await requestAgnesTextCompletion(agnesConfig, {
        userText: `主题：${theme}`,
        systemPrompt: prompt,
    });

    if (!reply?.trim()) {
        throw new Error('写词服务没有返回可用内容');
    }

    return normalizeLyrics(reply, options.maxChars, options.targetSeconds);
}

