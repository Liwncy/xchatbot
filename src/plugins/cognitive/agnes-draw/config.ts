import type {Env} from '../../../types/env.js';
import {AGNES_API_BASE_URL, DEFAULT_IMAGE_SIZE} from './constants.js';

export interface AgnesDrawConfig {
    apiKey: string;
    baseUrl: string;
    size: string;
}

export function resolveAgnesDrawConfig(env: Env): AgnesDrawConfig | null {
    const apiKey = env.AGNES_API_KEY?.trim();
    if (!apiKey) return null;

    return {
        apiKey,
        baseUrl: AGNES_API_BASE_URL,
        size: DEFAULT_IMAGE_SIZE,
    };
}
