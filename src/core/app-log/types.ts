export type AppLogLevel = 'warn' | 'error';

export type AppLogRecord = {
    id: number;
    createdAt: number;
    level: AppLogLevel;
    stage: string;
    summary: string;
    detail: string;
    platform: string;
    sessionId: string;
    messageId: string;
    pluginName: string;
};

export type WriteAppLog = {
    level: AppLogLevel;
    summary: string;
    detail?: string;
    stage?: string;
    platform?: string;
    sessionId?: string;
    messageId?: string;
    pluginName?: string;
};

export type AppLogSearch = {
    sessionId?: string;
    platform?: string;
    level?: AppLogLevel;
    stage?: string;
    messageId?: string;
    keyword?: string;
    sinceUnix?: number;
    untilUnix?: number;
    beforeId?: number;
    afterId?: number;
    limit: number;
};
