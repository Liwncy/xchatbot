export interface AgnesImageGenerationRequest {
    model: string;
    prompt: string;
    size: string;
    return_base64?: boolean;
    image?: string[];
    extra_body?: {
        image?: string[];
        response_format?: 'url' | 'b64_json';
    };
}

export interface AgnesImageGenerationResponse {
    created?: number;
    data?: Array<{
        url?: string | null;
        b64_json?: string | null;
        revised_prompt?: string | null;
    }>;
}
