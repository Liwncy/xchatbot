export interface TextReply {
    type: 'text';
    content: string;
    to?: string;
    mentions?: string[];
}

export interface ImageReply {
    type: 'image';
    url: string;
    to?: string;
}

export interface EmojiReply {
    type: 'emoji';
    md5: string;
    url?: string;
    to?: string;
}

export interface LinkReply {
    type: 'link';
    title: string;
    url: string;
    desc?: string;
    thumbUrl?: string;
    to?: string;
}

export interface VideoReply {
    type: 'video';
    url: string;
    thumbUrl?: string;
    duration?: number;
    to?: string;
}

export interface VoiceReply {
    type: 'voice';
    url: string;
    duration?: number;
    format?: string;
    to?: string;
}

export interface MusicReply {
    type: 'music';
    title: string;
    singer?: string;
    url?: string;
    dataUrl?: string;
    thumbUrl?: string;
    to?: string;
}

export interface AppReply {
    type: 'app';
    appType: number;
    xml: string;
    to?: string;
}

export interface CardReply {
    type: 'card';
    username: string;
    nickname?: string;
    alias?: string;
    to?: string;
}

export interface PositionReply {
    type: 'position';
    lat: number;
    lon: number;
    label?: string;
    poiName?: string;
    scale?: number;
    to?: string;
}

export interface ForwardReply {
    type: 'forward';
    xml: string;
    forwardType?: string;
    to?: string;
}

export interface HandledReply {
    kind: 'handled';
}

export type ReplyMessage =
    | TextReply
    | ImageReply
    | EmojiReply
    | LinkReply
    | VideoReply
    | VoiceReply
    | MusicReply
    | AppReply
    | CardReply
    | PositionReply
    | ForwardReply;

export type HandlerResponse = ReplyMessage | ReplyMessage[] | HandledReply | null;

export function textReply(content: string): TextReply {
    return {type: 'text', content};
}

export function imageReply(url: string): ImageReply {
    return {type: 'image', url};
}

export function emojiReply(md5: string, url?: string): EmojiReply {
    return url ? {type: 'emoji', md5, url} : {type: 'emoji', md5};
}

export function linkReply(title: string, url: string, desc?: string, thumbUrl?: string): LinkReply {
    return {type: 'link', title, url, desc, thumbUrl};
}

export function videoReply(url: string, thumbUrl?: string, duration?: number): VideoReply {
    return {type: 'video', url, thumbUrl, duration};
}

export function voiceReply(url: string, duration?: number, format?: string): VoiceReply {
    return {type: 'voice', url, duration, format};
}

export function musicReply(
    title: string,
    singer?: string,
    url?: string,
    dataUrl?: string,
    thumbUrl?: string,
): MusicReply {
    return {type: 'music', title, singer, url, dataUrl, thumbUrl};
}

export function appReply(appType: number, xml: string): AppReply {
    return {type: 'app', appType, xml};
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
