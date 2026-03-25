import type {TextMessage} from '../types';
import {logger} from '../../utils/logger';
import {
    fetchTemplatedValue,
    mergeTemplateParams,
} from './shared';
import {
    type ArgsConfig,
    findMatchContext,
    type MatchMode,
    normalizeKeyword,
    normalizeMatchMode,
} from './matcher';
import {loadRemoteRules} from './remote-config';
import {createCachedRuleParser} from './parser';
import {buildCommonReply} from './reply-builder';

type RequestMode = 'text' | 'base64' | 'json';
type ReplyType = 'text' | 'image' | 'video' | 'voice' | 'link';

interface WorkflowStep {
    name?: string;
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    mode: RequestMode;
    jsonPath?: string;
    /** 将本步骤结果写入模板变量上下文。 */
    saveAs?: string;
}

export interface WorkflowCommonRule {
    name?: string;
    keyword?: string | string[];
    pattern?: string;
    matchMode?: MatchMode;
    mode: 'workflow';
    rType: ReplyType;
    args?: ArgsConfig;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    steps: WorkflowStep[];
    /** workflow 模式最终输出来源（默认取最后一步结果）。 */
    outputFrom?: string;
}

function normalizeReplyType(t: string | undefined): ReplyType | undefined {
    const v = (t ?? '').trim().toLowerCase();
    if (v === 'text' || v === 'image' || v === 'video' || v === 'voice' || v === 'link') return v;
    return undefined;
}

function normalizeStepMode(mode: string | undefined): RequestMode | undefined {
    const m = (mode ?? '').trim().toLowerCase();
    if (m === 'text' || m === 'json' || m === 'base64') return m;
    if (m === 'base') return 'base64';
    return undefined;
}

const parseRules = createCachedRuleParser<WorkflowCommonRule>({
    logPrefix: 'COMMON_WORKFLOW_PLUGINS',
    mapItem: (rawRule) => {
        const mode = String(rawRule.mode ?? '').trim().toLowerCase();
        if (mode !== 'workflow') return null;

        const rType = normalizeReplyType(String(rawRule.rType ?? rawRule.fileType ?? ''));
        if (!rType) return null;

        const steps = Array.isArray(rawRule.steps)
            ? rawRule.steps
                .map((s) => {
                    if (!s || typeof s !== 'object') return null;
                    const step = s as Record<string, unknown>;
                    const stepMode = normalizeStepMode(String(step.mode ?? ''));
                    const stepUrl = String(step.url ?? '').trim();
                    if (!stepMode || !stepUrl) return null;

                    return {
                        name: typeof step.name === 'string' ? step.name : undefined,
                        url: stepUrl,
                        method: step.method === 'POST' ? 'POST' : 'GET',
                        headers: step.headers as Record<string, string> | undefined,
                        body: step.body,
                        mode: stepMode,
                        jsonPath: typeof step.jsonPath === 'string' ? step.jsonPath : undefined,
                        saveAs: typeof step.saveAs === 'string' ? step.saveAs : undefined,
                    } as WorkflowStep;
                })
                .filter((s): s is WorkflowStep => Boolean(s))
            : [];

        if (!steps.length) return null;

        const rule: WorkflowCommonRule = {
            name: typeof rawRule.name === 'string' ? rawRule.name : undefined,
            keyword: rawRule.keyword as string | string[] | undefined,
            pattern: typeof rawRule.pattern === 'string' ? rawRule.pattern : undefined,
            matchMode: normalizeMatchMode(String(rawRule.matchMode ?? '')),
            mode: 'workflow',
            rType,
            args: rawRule.args as ArgsConfig | undefined,
            linkTitle: typeof rawRule.linkTitle === 'string' ? rawRule.linkTitle : undefined,
            linkDescription: typeof rawRule.linkDescription === 'string' ? rawRule.linkDescription : undefined,
            linkPicUrl: typeof rawRule.linkPicUrl === 'string' ? rawRule.linkPicUrl : undefined,
            steps,
            outputFrom: typeof rawRule.outputFrom === 'string' ? rawRule.outputFrom : undefined,
        };

        if (rule.matchMode === 'regex' && !rule.pattern) return null;
        if (rule.matchMode !== 'regex' && normalizeKeyword(rule.keyword).length === 0) return null;
        return rule;
    },
});

async function resolveRules(env: {
    COMMON_PLUGINS_CONFIG_URL?: string;
    COMMON_WORKFLOW_PLUGINS_CLIENT_ID?: string;
    COMMON_PLUGINS_CLIENT_ID?: string;
}): Promise<WorkflowCommonRule[]> {
    const remoteUrl = env.COMMON_PLUGINS_CONFIG_URL?.trim();
    if (!remoteUrl) return [];

    const workflowClientId = env.COMMON_WORKFLOW_PLUGINS_CLIENT_ID?.trim();
    const fallbackClientId = env.COMMON_PLUGINS_CLIENT_ID?.trim();
    const clientId = workflowClientId || fallbackClientId || '';

    return loadRemoteRules({
        cacheNamespace: 'common-workflow',
        remoteUrl,
        clientId,
        parseRules: (rawText) => parseRules(rawText),
        logPrefix: 'workflow 通用插件',
    });
}

async function executeWorkflow(rule: WorkflowCommonRule, baseParams: Record<string, string>): Promise<unknown> {
    const context: Record<string, unknown> = {};
    let lastValue: unknown = null;

    for (const step of rule.steps) {
        const params = mergeTemplateParams(baseParams, context);
        const value = await fetchTemplatedValue(step, params, 'workflow step ');
        lastValue = value;

        if (step.saveAs?.trim()) {
            context[step.saveAs.trim()] = value;
        }
    }

    if (rule.outputFrom?.trim()) {
        return context[rule.outputFrom.trim()];
    }

    return lastValue;
}

export const workflowCommonPluginsEngine: TextMessage = {
    type: 'text',
    name: 'workflow-common-plugins-engine',
    description: '支持多步骤编排的通用插件',
    match: () => true,
    handle: async (message, env) => {
        const content = (message.content ?? '').trim();
        if (!content) return null;

        const rules = await resolveRules(env);
        if (!rules.length) return null;

        const context = findMatchContext<WorkflowCommonRule>(content, rules);
        if (!context) return null;

        const {rule, params} = context;

        try {
            const value = await executeWorkflow(rule, params);
            if (value === undefined || value === null || value === '') {
                logger.warn('workflow 通用插件未提取到有效返回值', {
                    rule: rule.name ?? rule.keyword ?? rule.pattern,
                    outputFrom: rule.outputFrom,
                });
                return null;
            }

            return await buildCommonReply(rule, value, 'workflow 通用插件');
        } catch (err) {
            logger.error('workflow 通用插件处理异常', {
                rule: rule.name ?? rule.keyword ?? rule.pattern,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    },
};

