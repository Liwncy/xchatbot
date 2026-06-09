import type {Env} from '../../../types/env.js';
import {
    AGNES_API_BASE_URL,
    DEFAULT_FRAME_RATE,
    DEFAULT_NUM_FRAMES,
    DEFAULT_VIDEO_HEIGHT,
    DEFAULT_VIDEO_WIDTH,
} from './constants.js';

export interface AgnesVideoConfig {
    apiKey: string;
    baseUrl: string;
    width: number;
    height: number;
    numFrames: number;
    frameRate: number;
}

export function resolveAgnesVideoConfig(env: Env): AgnesVideoConfig | null {
    const apiKey = env.AGNES_API_KEY?.trim();
    if (!apiKey) return null;

    return {
        apiKey,
        baseUrl: AGNES_API_BASE_URL,
        width: DEFAULT_VIDEO_WIDTH,
        height: DEFAULT_VIDEO_HEIGHT,
        numFrames: DEFAULT_NUM_FRAMES,
        frameRate: DEFAULT_FRAME_RATE,
    };
}
