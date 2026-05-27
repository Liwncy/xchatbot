import {logger} from '../../utils/logger.js';

export interface MimoTtsMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface MimoTtsRequestOptions {
    apiUrl: string;
    apiKey?: string;
    model: string;
    voice: string;
    text: string;
    styleTags?: string[];
    instruction?: string;
    singing?: boolean;
}

export interface MimoTtsResult {
    audioBase64: string;
    durationMs: number;
    spokenText: string;
}

interface MimoAudioPayload {
    data?: string;
}

interface MimoChoiceMessage {
    content?: string;
    audio?: MimoAudioPayload;
}

interface MimoChoice {
    message?: MimoChoiceMessage;
}

interface MimoCompletionResponse {
    choices?: MimoChoice[];
}

function normalizeBase64(value?: string): string {
    const trimmed = value?.trim() ?? '';
    const matched = trimmed.match(/^data:[^;]+;base64,(.+)$/iu);
    return matched?.[1]?.trim() || trimmed;
}

function buildStylePrefix(styleTags: string[], singing: boolean): string {
    const normalized = [...new Set(styleTags.map((item) => item.trim()).filter(Boolean))].slice(0, 5);
    const tags = singing ? ['唱歌', ...normalized] : normalized;
    return tags.map((item) => `(${item})`).join('');
}

function estimateDurationMs(text: string, singing: boolean): number {
    const plainText = text.replace(/[(（\[].*?[)）\]]/gu, '').replace(/\s+/gu, '');
    const visibleLength = plainText.length || 1;
    const perCharMs = singing ? 320 : 180;
    const estimated = visibleLength * perCharMs;
    return Math.min(60_000, Math.max(singing ? 8_000 : 2_000, estimated));
}

function buildMessages(text: string, styleTags: string[], instruction?: string, singing?: boolean): MimoTtsMessage[] {
    const messages: MimoTtsMessage[] = [];
    const normalizedInstruction = instruction?.trim();
    if (normalizedInstruction) {
        messages.push({role: 'user', content: normalizedInstruction});
    }

    const assistantContent = `${buildStylePrefix(styleTags, Boolean(singing))}${text}`;
    messages.push({role: 'assistant', content: assistantContent});
    return messages;
}

export async function requestMimoTts(options: MimoTtsRequestOptions): Promise<MimoTtsResult> {
    const apiUrl = options.apiUrl.trim();
    if (!apiUrl) {
        throw new Error('MiMo TTS 服务地址不能为空');
    }

    const voice = options.voice.trim();
    if (!voice) {
        throw new Error('MiMo TTS 音色不能为空');
    }

    const spokenText = options.text.trim();
    if (!spokenText) {
        throw new Error('MiMo TTS 朗读文本不能为空');
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const apiKey = options.apiKey?.trim();
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const messages = buildMessages(spokenText, options.styleTags ?? [], options.instruction, options.singing);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: options.model.trim(),
            messages,
            audio: {
                format: 'mp3',
                voice,
            },
        }),
    });

    if (!response.ok) {
        const bodyPreview = (await response.text()).slice(0, 500);
        logger.warn('MiMo TTS 请求失败', {status: response.status, apiUrl, bodyPreview});
        throw new Error(`status=${response.status} url=${apiUrl}`);
    }

    const data = (await response.json()) as MimoCompletionResponse;
    const audioBase64 = normalizeBase64(data.choices?.[0]?.message?.audio?.data);
    if (!audioBase64) {
        throw new Error('MiMo TTS 未返回音频数据');
    }

    return {
        audioBase64,
        durationMs: estimateDurationMs(messages[messages.length - 1]?.content ?? spokenText, Boolean(options.singing)),
        spokenText,
    };
}


