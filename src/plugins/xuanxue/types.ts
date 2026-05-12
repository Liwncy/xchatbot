export type XuanxueMatchMode = 'exact' | 'prefix';

export type XuanxueParseMode = 'text' | 'regex' | 'jsonPath' | 'htmlText' | 'baziHtml' | 'heHunHtml' | 'hePanHtml' | 'paipanHtml' | 'jingpanHtml' | 'caiyunHtml' | 'zhanbuHtml' | 'daliurenHtml' | 'weilaiHtml' | 'zwpanHtml' | 'qimenHtml' | 'xingpanHtml' | 'jinkoujueHtml' | 'meihuaHtml' | 'liuyaoHtml' | 'jiuxingHtml' | 'shengriHtml' | 'guxiangHtml' | 'chengguHtml' | 'liudaoHtml' | 'zhengyuanHtml' | 'yinyuanHtml' | 'mingyunHtml' | 'caiyunYuceHtml' | 'jiehunHtml' | 'shuziHtml' | 'xingzuoDailyHtml' | 'tongzimingHtml' | 'zeshiHtml' | 'laohuangliHtml' | 'xuankongHtml' | 'xingmingPeiduiHtml' | 'shengriPeiduiHtml' | 'xingzuoPeiduiHtml' | 'shengxiaoPeiduiHtml' | 'xuexingPeiduiHtml' | 'xingmingDafenHtml' | 'qimingDafenHtml' | 'gongsiDafenHtml' | 'qimingListHtml';

export type XuanxueArgsMode = 'split' | 'regex';

export interface XuanxueArgsConfig {
    mode?: XuanxueArgsMode;
    delimiter?: string;
    names?: string[];
    required?: string[];
    /** 条件非空校验：当 key 的值（归一化后）等于 value 时，列出的字段为必填 */
    conditional?: Array<{when: string; is: string; require: string[]}>;
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
    /** 在「玄学帮助」中的分类名称，不填则归入「其他功能」 */
    helpCategory?: string;
}

export interface XuanxueMatchContext {
    rule: XuanxueRule;
    keyword: string;
    query: string;
}

