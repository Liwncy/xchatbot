export interface AgnesTextChatCompletionRequest {
    model: string;
    messages: AgnesTextChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

export type AgnesTextMessageContent =
    | string
    | Array<
        | {type: 'text'; text: string}
        | {type: 'image_url'; image_url: {url: string}}
    >;

export interface AgnesTextChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: AgnesTextMessageContent;
}

export interface AgnesTextChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}
