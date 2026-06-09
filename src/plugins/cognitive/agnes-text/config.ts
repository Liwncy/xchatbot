import type {Env} from '../../../types/env.js';
import {AGNES_API_BASE_URL} from './constants.js';

export interface AgnesTextConfig {
    apiKey: string;
    baseUrl: string;
}

export function resolveAgnesTextConfig(env: Env): AgnesTextConfig | null {
    const apiKey = env.AGNES_API_KEY?.trim();
    if (!apiKey) return null;

    return {
        apiKey,
        baseUrl: AGNES_API_BASE_URL,
    };
}
