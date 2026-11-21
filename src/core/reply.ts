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
    /** 有指纹就按指纹发。只有动图链接时可以不填。 */
    md5?: string;
    url?: string;
    to?: string;
    /** 用链接发出去之后，按这些记进自己的库。 */
    stashName?: string;
    stashTags?: string[];
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

export interface ChatRecordTextItem {
    type?: 'text';
    nickname: string;
    content: string;
    avatarUrl?: string;
    timestampMs: number;
}

export interface ChatRecordImageItem {
    type: 'image';
    nickname: string;
    url: string;
    alt?: string;
    avatarUrl?: string;
    timestampMs: number;
    /** 聊天记录上传 CDN 后的密钥。有它时 url 是 file_id。 */
    aesKey?: string;
}

export type ChatRecordItem = ChatRecordTextItem | ChatRecordImageItem;

export interface ChatRecordReply {
    type: 'chat-record';
    items: ChatRecordItem[];
    title?: string;
    summary?: string;
    desc?: string;
    to?: string;
}

export interface NoteTextItem {
    type?: 'text';
    content: string;
}

export interface NoteImageItem {
    type: 'image';
    /** 公网图片链接；适配器负责转存成平台资源。 */
    url: string;
    alt?: string;
}

export type NoteItem = NoteTextItem | NoteImageItem;

/** 一篇笔记：有标题和作者的长文，条目按顺序排下来，不带发送人。 */
export interface NoteReply {
    type: 'note';
    items: NoteItem[];
    title?: string;
    desc?: string;
    author?: string;
    editor?: string;
    /** 最后编辑时间，毫秒。 */
    editedAtMs?: number;
    to?: string;
}

/** 在当前会话里拍某个人。私聊时 username 填对方。 */
export interface PatReply {
    type: 'pat';
    username: string;
    to?: string;
}

export interface FileReply {
    type: 'file';
    url: string;
    /** 含扩展名。不填时由平台从链接里取。 */
    name?: string;
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
    | ForwardReply
    | ChatRecordReply
    | NoteReply
    | PatReply
    | FileReply;

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

/** 还没有指纹的动图。发出去之后适配器会把返回的指纹记下。 */
export function emojiLinkReply(
    url: string,
    extras?: Pick<EmojiReply, 'stashName' | 'stashTags'>,
): EmojiReply {
    return {type: 'emoji', url, ...extras};
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

export function chatRecordReply(
    items: ChatRecordItem[],
    extras?: Pick<ChatRecordReply, 'title' | 'summary' | 'desc' | 'to'>,
): ChatRecordReply {
    return {type: 'chat-record', items, ...extras};
}

export function patReply(username: string): PatReply {
    return {type: 'pat', username};
}

export function fileReply(url: string, name?: string): FileReply {
    return name ? {type: 'file', url, name} : {type: 'file', url};
}

export function noteReply(
    items: NoteItem[],
    extras?: Pick<NoteReply, 'title' | 'desc' | 'author' | 'editor' | 'editedAtMs' | 'to'>,
): NoteReply {
    return {type: 'note', items, ...extras};
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
