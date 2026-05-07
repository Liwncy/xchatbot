import type {WorkflowCommonRule} from '../common/workflow.js';

export type RulePluginCategory = 'common' | 'dynamic' | 'workflow';

export interface CommonRuleInputPatch {
    name?: string;
    keyword?: string;
    url?: string;
    method?: 'GET' | 'POST';
    mode?: 'text' | 'json' | 'base64';
    jsonPath?: string;
    rType?: 'text' | 'image' | 'video' | 'voice' | 'link' | 'card' | 'app';
    headers?: string;
    body?: string;
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

export interface WorkflowRuleInputPatch {
    name?: string;
    keyword?: string;
    pattern?: string;
    matchMode?: 'contains' | 'prefix' | 'exact' | 'regex';
    argsMode?: 'tail' | 'split' | 'regex';
    argsDelimiter?: string;
    argsNames?: string;
    argsRequired?: string;
    rType?: 'text' | 'image' | 'video' | 'voice' | 'link' | 'card' | 'app';
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
    steps?: string | WorkflowCommonRule['steps'];
    stepAction?: 'append' | 'insert' | 'update' | 'delete' | 'move' | 'rename' | 'copy' | 'enable' | 'disable';
    stepIndex?: string;
    stepName?: string;
    stepTargetIndex?: string;
    stepTargetName?: string;
    stepPayload?: string;
    outputFrom?: string;
}

export interface WorkflowStepSelectorInput {
    stepIndex?: string;
    stepName?: string;
    view?: 'steps-json' | 'rule-json';
}

export type RuleInputPatch = CommonRuleInputPatch | DynamicRuleInputPatch | WorkflowRuleInputPatch;

export type PluginAdminCommand =
    | {action: 'help'}
    | {action: 'refresh'}
    | {action: 'list'; category?: RulePluginCategory}
    | {action: 'search'; category: RulePluginCategory; query: string}
    | {action: 'detail'; category: RulePluginCategory; name: string; stepSelector?: WorkflowStepSelectorInput}
    | {action: 'delete'; category: RulePluginCategory; name: string; confirmed?: boolean}
    | {action: 'preview-copy'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'copy'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'preview-rename'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'rename'; category: RulePluginCategory; sourceName: string; targetName: string}
    | {action: 'preview-rollback'; category: RulePluginCategory}
    | {action: 'rollback'; category: RulePluginCategory}
    | {action: 'check'; category: RulePluginCategory; fields: RuleInputPatch}
    | {action: 'preview-add'; category: 'workflow'; fields: WorkflowRuleInputPatch}
    | {action: 'add'; category: RulePluginCategory; fields: RuleInputPatch}
    | {action: 'preview-update'; category: 'workflow'; name: string; fields: WorkflowRuleInputPatch}
    | {action: 'update'; category: RulePluginCategory; name: string; fields: RuleInputPatch};

export interface PluginAdminCategoryMeta {
    category: RulePluginCategory;
    liveKey: string;
    backupKey: string;
    displayName: string;
}

