export type XuanxueMatchMode = 'exact' | 'prefix';

export type XuanxueParseMode = 'text' | 'regex' | 'jsonPath' | 'htmlText' | 'baziHtml' | 'heHunHtml' | 'hePanHtml' | 'paipanHtml';

export type XuanxueArgsMode = 'split' | 'regex';

export interface XuanxueArgsConfig {
    mode?: XuanxueArgsMode;
    delimiter?: string;
    names?: string[];
    required?: string[];
    pattern?: string;
    flags?: string;
}

export interface XuanxueParseConfig {
    mode: XuanxueParseMode;
    pattern?: string;
    flags?: string;
    group?: number;
    path?: string;
    maxLength?: number;
}

export interface XuanxueRule {
    name: string;
    enabled?: boolean;
    keyword: string | string[];
    matchMode?: XuanxueMatchMode;
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    args?: XuanxueArgsConfig;
    parse: XuanxueParseConfig;
    replyMode?: 'text' | 'forward';
    forwardTitle?: string;
    forwardNickname?: string;
    forwardAvatarUrl?: string;
    replyTemplate?: string;
    usage?: string;
    /** 在「玄学帮助」列表中显示的一行简介，不填则不出现在帮助列表里 */
    helpEntry?: string;
}

export interface XuanxueMatchContext {
    rule: XuanxueRule;
    keyword: string;
    query: string;
}

