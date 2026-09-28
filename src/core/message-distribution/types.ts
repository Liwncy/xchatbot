import type {MessageSource, MessageType} from '../message.js';

export type DistributionStatus = 'active' | 'disabled';
export type DistributionContentMode = 'auto' | 'original' | 'rebuild' | 'ai';
export type DistributionOutput = 'auto' | 'text' | 'link' | 'media';
export type DistributionFallback = 'rebuild' | 'text' | 'skip';

export interface DistributionSource {
    kind: MessageSource | 'any';
    ids: string[];
}

export interface DistributionTarget {
    platform: string;
    kind: 'group' | 'user';
    id: string;
}

export interface DistributionContentPolicy {
    mode: DistributionContentMode;
    output: DistributionOutput;
    fallback: DistributionFallback;
    instruction?: string;
    prefix?: string;
    suffix?: string;
    includeSource: boolean;
    includeSender: boolean;
    includeOriginalUrl: boolean;
    maxInputChars: number;
    maxOutputChars: number;
    timeoutMs: number;
}

export interface DistributionRule {
    id: string;
    name: string;
    status: DistributionStatus;
    priority: number;
    source: DistributionSource;
    messageTypes: MessageType[];
    keywords: string[];
    pattern?: string;
    targets: DistributionTarget[];
    contentPolicy: DistributionContentPolicy;
    continuePipeline: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DistributionRuleInput {
    name: string;
    status?: DistributionStatus;
    priority?: number;
    source?: Partial<DistributionSource>;
    messageTypes?: MessageType[];
    keywords?: string[];
    pattern?: string;
    targets: DistributionTarget[];
    contentPolicy?: Partial<DistributionContentPolicy>;
    continuePipeline?: boolean;
}

export const DEFAULT_CONTENT_POLICY: DistributionContentPolicy = {
    mode: 'auto',
    output: 'auto',
    fallback: 'rebuild',
    includeSource: true,
    includeSender: false,
    includeOriginalUrl: true,
    maxInputChars: 12_000,
    maxOutputChars: 1_000,
    timeoutMs: 20_000,
};
