export interface AiRecognizeResponse {
    code?: number;
    msg?: string;
    result?: string;
}

export interface WechatCdnImageMeta {
    fileId: string;
    fileAesKey: string;
}

export type RecognizeImageInput =
    | {kind: 'url'; value: string}
    | {kind: 'base64'; value: string}
    | {kind: 'blob'; value: Blob};
