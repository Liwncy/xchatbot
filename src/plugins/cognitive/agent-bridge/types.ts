export type AgentBridgeProvider = 'openclaw';

export interface AgentBridgeRuntimeConfig {
    enabled: boolean;
    provider: AgentBridgeProvider;
    baseUrl: string;
    token: string;
    model: string;
    sessionTtlSec: number;
    requestTimeoutMs: number;
}

export interface AgentBridgeSessionState {
    conversationId?: string;
    updatedAt: number;
}

export interface OpenClawChatCompletionResponse {
    id?: string;
    conversation_id?: string;
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
    error?: {
        message?: string;
    };
}
