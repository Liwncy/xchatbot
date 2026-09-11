export interface TextReply {
    type: 'text';
    content: string;
    to?: string;
    mentions?: string[];
}

export interface HandledReply {
    kind: 'handled';
}

export type ReplyMessage = TextReply;
export type HandlerResponse = ReplyMessage | ReplyMessage[] | HandledReply | null;

export function textReply(content: string): TextReply {
    return {type: 'text', content};
}

export function handledReply(): HandledReply {
    return {kind: 'handled'};
}

export function isHandledReply(value: unknown): value is HandledReply {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && (value as {kind?: unknown}).kind === 'handled';
}

export function toReplyArray(response: HandlerResponse): ReplyMessage[] {
    if (!response || isHandledReply(response)) return [];
    return Array.isArray(response) ? response : [response];
}
