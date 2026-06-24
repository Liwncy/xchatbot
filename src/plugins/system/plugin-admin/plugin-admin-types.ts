export type RulePluginCategory = 'common' | 'dynamic';

export interface CommonRuleInputPatch {
    name?: string;
    description?: string;
    keyword?: string;
    url?: string;
    method?: 'GET' | 'POST';
    mode?: 'text' | 'json' | 'base64';
    jsonPath?: string;
    rType?: 'text' | 'image' | 'video' | 'voice' | 'link' | 'card' | 'app';
    headers?: string;
    body?: string;
    requestConfig?: string;
    replyPayload?: string;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    voiceFormat?: string;
    voiceDurationMs?: string;
    voiceFallbackText?: string;
    cardUsername?: string;
    cardNickname?: string;
    cardAlias?: string;
    appType?: string;
    appXml?: string;
}

export interface DynamicRuleInputPatch extends CommonRuleInputPatch {
    pattern?: string;
    matchMode?: 'contains' | 'prefix' | 'exact' | 'regex';
    argsMode?: 'tail' | 'split' | 'regex';
    argsDelimiter?: string;
    argsNames?: string;
    argsRequired?: string;
}

export type RuleInputPatch = CommonRuleInputPatch | DynamicRuleInputPatch;

export type PluginAdminCommand =
    | {action: 'help'}
    | {action: 'refresh'}
    | {action: 'list'; category?: RulePluginCategory}
    | {action: 'search'; category: RulePluginCategory; query: string}
    | {action: 'detail'; category: RulePluginCategory; name: string}
    | {action: 'delete'; category: RulePluginCategory; name: string; confirmed?: boolean}
    | {action: 'preview-copy'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'copy'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'preview-rename'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'rename'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'preview-rollback'; category: RulePluginCategory}
    | {action: 'rollback'; category: RulePluginCategory}
    | {action: 'check'; category: RulePluginCategory; fields: RuleInputPatch}
    | {action: 'add'; category: RulePluginCategory; fields: RuleInputPatch}
    | {action: 'update'; category: RulePluginCategory; name: string; fields: RuleInputPatch};

export interface PluginAdminCategoryMeta {
    category: RulePluginCategory;
    liveKey: string;
    backupKey: string;
    displayName: string;
}

