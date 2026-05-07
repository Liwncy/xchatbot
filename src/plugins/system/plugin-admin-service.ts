import {
    KV_COMMON_BASE_RULES,
    KV_COMMON_BASE_RULES_BACKUP,
    KV_COMMON_DYNAMIC_RULES,
    KV_COMMON_DYNAMIC_RULES_BACKUP,
    KV_COMMON_WORKFLOW_RULES,
    KV_COMMON_WORKFLOW_RULES_BACKUP,
} from '../../constants/kv.js';
import {clearRemoteRulesCache} from '../common/remote-config.js';
import type {CommonPluginRule} from '../common/base.js';
import type {DynamicCommonRule} from '../common/dynamic.js';
import type {WorkflowCommonRule} from '../common/workflow.js';
import {normalizeKeyword as normalizeMatchKeywords} from '../common/matcher.js';
import type {ArgsConfig, ArgsMode, MatchMode} from '../common/matcher.js';
import type {Env, IncomingMessage, TextReply} from '../../types/message.js';
import type {
    CommonRuleInputPatch,
    DynamicRuleInputPatch,
    PluginAdminCategoryMeta,
    PluginAdminCommand,
    RulePluginCategory,
    WorkflowStepSelectorInput,
} from './plugin-admin-types.js';

const SUPPORTED_COMMON_MODES = new Set(['text', 'json', 'base64'] as const);
const SUPPORTED_COMMON_REPLY_TYPES = new Set(['text', 'image', 'video', 'voice', 'link', 'card', 'app'] as const);
const SUPPORTED_HTTP_METHODS = new Set(['GET', 'POST'] as const);
const SUPPORTED_DYNAMIC_MATCH_MODES = new Set(['contains', 'prefix', 'exact', 'regex'] as const);
const SUPPORTED_DYNAMIC_ARGS_MODES = new Set(['tail', 'split', 'regex'] as const);
const PLUGIN_ADMIN_VALUE_PREVIEW_LENGTH = 80;

type ArgsInputPatch = {
    argsMode?: string;
    argsDelimiter?: string;
    argsNames?: string;
    argsRequired?: string;
};

type WorkflowRuleWritePatch = {
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
    stepAction?: string;
    stepIndex?: string;
    stepName?: string;
    stepTargetIndex?: string;
    stepTargetName?: string;
    stepPayload?: string;
    outputFrom?: string;
};

type WorkflowStepEditAction = 'append' | 'insert' | 'update' | 'delete' | 'move' | 'rename' | 'copy' | 'enable' | 'disable';

type WorkflowStepEditPatch = {
    action: WorkflowStepEditAction;
    index?: number;
    name?: string;
    targetIndex?: number;
    targetName?: string;
    payload?: Record<string, unknown>;
};

type WorkflowStepSelector = {
    index?: number;
    name?: string;
    view?: 'steps-json' | 'rule-json';
};

type NormalizedWorkflowRulePatch = Omit<WorkflowRuleWritePatch, 'steps' | 'stepAction' | 'stepIndex' | 'stepName' | 'stepPayload'> & {
    steps?: WorkflowCommonRule['steps'];
    stepEdit?: WorkflowStepEditPatch;
};

const CATEGORY_META_MAP: Record<RulePluginCategory, PluginAdminCategoryMeta> = {
    common: {
        category: 'common',
        liveKey: KV_COMMON_BASE_RULES,
        backupKey: KV_COMMON_BASE_RULES_BACKUP,
        displayName: '基础通用规则',
    },
    dynamic: {
        category: 'dynamic',
        liveKey: KV_COMMON_DYNAMIC_RULES,
        backupKey: KV_COMMON_DYNAMIC_RULES_BACKUP,
        displayName: '动态通用规则',
    },
    workflow: {
        category: 'workflow',
        liveKey: KV_COMMON_WORKFLOW_RULES,
        backupKey: KV_COMMON_WORKFLOW_RULES_BACKUP,
        displayName: 'workflow 通用规则',
    },
};

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeNonEmptyString(value: unknown, fieldLabel: string): string {
    if (typeof value !== 'string') {
        throw new Error(`${fieldLabel}必须是字符串`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldLabel}不能为空`);
    }
    return trimmed;
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeRuleName(value: unknown): string {
    const name = normalizeNonEmptyString(value, '名称');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(name)) {
        throw new Error('名称仅支持 1-80 位字母、数字、下划线和中划线，且必须以字母或数字开头');
    }
    return name;
}

function normalizeKeyword(value: unknown): string | string[] {
    if (typeof value === 'string') {
        const keyword = value.trim();
        if (!keyword) {
            throw new Error('关键词不能为空');
        }
        return keyword;
    }

    if (Array.isArray(value)) {
        const keywords = value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
        if (!keywords.length) {
            throw new Error('关键词不能为空');
        }
        return keywords;
    }

    throw new Error('关键词必须是字符串或字符串数组');
}

function normalizeHttpUrl(value: unknown): string {
    const urlText = normalizeNonEmptyString(value, '地址');
    let url: URL;
    try {
        url = new URL(urlText);
    } catch {
        throw new Error('地址必须是合法 URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('地址仅支持 http/https');
    }
    return url.toString();
}

function normalizeMode(value: unknown): CommonPluginRule['mode'] {
    const mode = normalizeNonEmptyString(value, '模式').toLowerCase();
    if (!SUPPORTED_COMMON_MODES.has(mode as CommonPluginRule['mode'])) {
        throw new Error('模式仅支持 text/json/base64');
    }
    return mode as CommonPluginRule['mode'];
}

function normalizeReplyType(value: unknown): CommonPluginRule['rType'] {
    const replyType = normalizeNonEmptyString(value, '回复').toLowerCase();
    if (!SUPPORTED_COMMON_REPLY_TYPES.has(replyType as CommonPluginRule['rType'])) {
        throw new Error('回复仅支持 text/image/video/voice/link/card/app');
    }
    return replyType as CommonPluginRule['rType'];
}

function normalizeMethod(value: unknown): 'GET' | 'POST' {
    const method = normalizeNonEmptyString(value, '请求').toUpperCase();
    if (!SUPPORTED_HTTP_METHODS.has(method as 'GET' | 'POST')) {
        throw new Error('请求仅支持 GET/POST');
    }
    return method as 'GET' | 'POST';
}

function normalizeMatchModeStrict(value: unknown): MatchMode {
    const matchMode = normalizeNonEmptyString(value, '匹配模式').toLowerCase();
    if (!SUPPORTED_DYNAMIC_MATCH_MODES.has(matchMode as MatchMode)) {
        throw new Error('匹配模式仅支持 contains/prefix/exact/regex');
    }
    return matchMode as MatchMode;
}

function normalizeArgsModeStrict(value: unknown): ArgsMode {
    const argsMode = normalizeNonEmptyString(value, '参数模式').toLowerCase();
    if (!SUPPORTED_DYNAMIC_ARGS_MODES.has(argsMode as ArgsMode)) {
        throw new Error('参数模式仅支持 tail/split/regex');
    }
    return argsMode as ArgsMode;
}

function normalizeOptionalPipeList(value: unknown, fieldLabel: string): string[] | undefined {
    const text = normalizeOptionalString(value);
    if (!text) return undefined;
    const items = text.split('|').map((item) => item.trim()).filter(Boolean);
    if (!items.length) {
        throw new Error(`${fieldLabel}不能为空`);
    }
    return items;
}

function normalizeOptionalInteger(value: unknown, fieldLabel: string): number | undefined {
    const text = normalizeOptionalString(value);
    if (!text) return undefined;
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
        throw new Error(`${fieldLabel}必须是数字`);
    }
    return Math.floor(numeric);
}

function normalizeOptionalHttpUrl(value: unknown, fieldLabel: string): string | undefined {
    const text = normalizeOptionalString(value);
    if (!text) return undefined;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        throw new Error(`${fieldLabel}必须是合法 URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${fieldLabel}仅支持 http/https`);
    }
    return url.toString();
}

function normalizeJsonValue(value: unknown, fieldLabel: string): unknown {
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return undefined;
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`${fieldLabel}必须是合法 JSON`);
        }
    }
    return value;
}

function normalizeJsonObject(value: unknown, fieldLabel: string): Record<string, unknown> {
    const parsed = normalizeJsonValue(value, fieldLabel);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${fieldLabel}必须是 JSON 对象`);
    }
    return {...(parsed as Record<string, unknown>)};
}

function normalizeHeadersValue(value: unknown): Record<string, string> | undefined {
    const parsed = normalizeJsonValue(value, '请求头');
    if (parsed == null) return undefined;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('请求头必须是 JSON 对象');
    }

    const headers: Record<string, string> = {};
    for (const [headerKey, headerValue] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof headerValue !== 'string') {
            throw new Error(`请求头 ${headerKey} 的值必须是字符串`);
        }
        headers[headerKey] = headerValue;
    }
    return headers;
}

function validateReplySpecificFields(rule: {
    rType: CommonPluginRule['rType'];
    linkPicUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    cardUsername?: string;
    cardNickname?: string;
    appXml?: string;
    appType?: number;
}): void {
    if (rule.rType === 'link' && rule.linkPicUrl) {
        normalizeOptionalHttpUrl(rule.linkPicUrl, '链接图片');
    }
    if (rule.rType === 'voice') {
        if (rule.voiceFormat != null && !Number.isFinite(rule.voiceFormat)) {
            throw new Error('语音格式必须是数字');
        }
        if (rule.voiceDurationMs != null && !Number.isFinite(rule.voiceDurationMs)) {
            throw new Error('语音时长必须是数字');
        }
    }
    if (rule.rType === 'card') {
        if (!rule.cardUsername?.trim() || !rule.cardNickname?.trim()) {
            throw new Error('card 回复至少需要卡片用户名和卡片昵称');
        }
    }
    if (rule.rType === 'app') {
        if (!rule.appXml?.trim()) {
            throw new Error('app 回复至少需要 appXml');
        }
        if (rule.appType != null && !Number.isFinite(rule.appType)) {
            throw new Error('app类型必须是数字');
        }
    }
}

function keywordPreview(keyword: unknown): string {
    if (Array.isArray(keyword)) {
        return keyword.filter((item): item is string => typeof item === 'string').join('|');
    }
    return typeof keyword === 'string' ? keyword : '';
}

function matcherPreview(rule: Record<string, unknown>): string {
    const keyword = keywordPreview(rule.keyword);
    if (keyword) return keyword;
    const pattern = normalizeOptionalString(rule.pattern);
    if (pattern) return `regex: ${pattern}`;
    return '（无匹配条件）';
}

function formatWarningPrefix(warning?: string): string {
    return warning ? `${warning}\n\n` : '';
}

function formatChangedFields(changedFields: string[]): string {
    return changedFields.length ? changedFields.join('、') : '无';
}

function clipPreviewText(text: string, maxLength = PLUGIN_ADMIN_VALUE_PREVIEW_LENGTH): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatUnknownValueExpanded(value: unknown): string {
    if (value == null) return 'null';
    if (typeof value === 'string') return value.trim() || '（空字符串）';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function pushDetailValueBlock(lines: string[], label: string, value: unknown): void {
    const formatted = formatUnknownValueExpanded(value);
    const blockLines = formatted.split('\n');
    if (blockLines.length <= 1) {
        lines.push(`- ${label}：${formatted}`);
        return;
    }
    lines.push(`- ${label}：`);
    lines.push(...blockLines.map((line) => `  ${line}`));
}

function buildRulePreviewLine(rule: Record<string, unknown>, index: number): string {
    const name = normalizeOptionalString(rule.name) ?? `(未命名-${index + 1})`;
    return `${index + 1}. ${name} - ${matcherPreview(rule)}`;
}

function buildHelpSection(title: string, lines: string[]): string[] {
    return [title, ...lines, ''];
}

function buildHelpQuerySectionLines(): string[] {
    return buildHelpSection('一、查询命令', [
        '- 插件管理 帮助',
        '- 插件管理 列表 [common|dynamic|workflow]',
        '- 插件管理 搜索 <分类> <关键字>',
        '- 插件管理 详情 common <名称>',
        '- 插件管理 详情 dynamic <名称>',
        '- 插件管理 详情 workflow <名称>',
        '- 插件管理 详情 workflow <名称> + 换行“步骤序号：2”',
        '- 插件管理 详情 workflow <名称> + 换行“步骤名称：render”',
        '- 插件管理 详情 workflow <名称> + 换行“查看：步骤JSON”',
        '- 插件管理 详情 workflow <名称> + 换行“查看：规则JSON”',
        '- 插件管理 检查 <分类>',
        '- 插件管理 刷新',
    ]);
}

function buildHelpPreviewSectionLines(): string[] {
    return buildHelpSection('二、只读预览命令', [
        '- 插件管理 预览添加 workflow',
        '- 插件管理 预览修改 workflow <名称>',
        '- 插件管理 预览删除 <分类> <名称>',
        '- 插件管理 删除 <分类> <名称>    （当前仍是只预览，不会立刻执行）',
        '- 插件管理 预览复制 <分类> <原名称> <新名称>',
        '- 插件管理 预览重命名 <分类> <原名称> <新名称>',
        '- 插件管理 预览回滚 <分类>',
    ]);
}

function buildHelpWriteSectionLines(): string[] {
    return buildHelpSection('三、写入命令', [
        '- 插件管理 添加 common',
        '- 插件管理 添加 dynamic',
        '- 插件管理 添加 workflow',
        '- 插件管理 修改 <分类> <名称>',
        '- 插件管理 确认删除 <分类> <名称>',
        '- 插件管理 复制 <分类> <原名称> <新名称>',
        '- 插件管理 重命名 <分类> <原名称> <新名称>',
        '- 插件管理 回滚 <分类>',
    ]);
}

function buildHelpWriteExampleLines(): string[] {
    return buildHelpSection('四、常用写入示例', [
        '- 插件管理 添加 common',
        '  名称：xxx',
        '  关键词：xxx|yyy',
        '  地址：https://example.com/api',
        '  模式：json',
        '  提取：$.data.text',
        '  回复：text',
        '  请求头：<<<',
        '  {"Accept":"application/json"}',
        '  >>>',
        '  请求体：<<<',
        '  {"id":123}',
        '  >>>',
        '',
        '- 插件管理 添加 dynamic',
        '  名称：weather-regex',
        '  正则：^天气\\s+(.+)$',
        '  匹配模式：regex',
        '  参数模式：regex',
        '  参数名：query',
        '  地址：https://example.com/weather?q={{query}}',
        '  模式：json',
        '  提取：$.data.text',
        '  回复：text',
        '',
        '- 插件管理 添加 workflow',
        '  名称：weather-workflow',
        '  正则：^天气\\s+(.+)$',
        '  匹配模式：regex',
        '  参数模式：regex',
        '  参数名：query',
        '  回复：text',
        '  步骤：<<<',
        '  [{"name":"search","url":"https://example.com/weather?q={{query}}","mode":"json","jsonPath":"$.data.text","saveAs":"result"}]',
        '  >>>',
        '  输出来源：result',
    ]);
}

function buildHelpWorkflowEditExampleLines(): string[] {
    return buildHelpSection('五、workflow 常用预览 / 增量编辑示例', [
        '- 插件管理 预览添加 workflow',
        '  名称：weather-workflow-preview',
        '  关键词：天气预览',
        '  回复：text',
        '  步骤：<<<',
        '  [{"name":"search","url":"https://example.com/weather?q={{keyword}}","mode":"text","saveAs":"result"}]',
        '  >>>',
        '',
        '- 插件管理 预览修改 workflow weather-workflow',
        '  步骤操作：复制',
        '  步骤名称：render-step',
        '  目标步骤序号：2',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：追加',
        '  步骤内容：<<<',
        '  {"name":"render","url":"https://example.com/render?value={{result}}","mode":"text","saveAs":"final"}',
        '  >>>',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：移动',
        '  步骤名称：render',
        '  目标步骤序号：1',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：重命名',
        '  步骤名称：render',
        '  目标步骤名称：render-text',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：复制',
        '  步骤名称：render-text',
        '  目标步骤序号：2',
        '  步骤内容：<<<',
        '  {"name":"render-copy","saveAs":"renderCopy"}',
        '  >>>',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：禁用',
        '  步骤名称：render-copy',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：启用',
        '  步骤名称：render-copy',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：修改',
        '  步骤序号：2',
        '  步骤内容：<<<',
        '  {"saveAs":"finalText"}',
        '  >>>',
        '',
        '- 插件管理 修改 workflow weather-workflow',
        '  步骤操作：删除',
        '  步骤名称：render',
    ]);
}

function buildHelpFieldNotesLines(): string[] {
    return [
        '六、字段与格式说明',
        'common / dynamic 额外支持字段：请求头、请求体、链接标题、链接描述、链接图片、语音格式、语音时长、语音降级文案、卡片用户名、卡片昵称、卡片别名、app类型、appXml',
        'dynamic / workflow 额外支持字段：正则、匹配模式、参数模式、参数分隔符、参数名、必填参数',
        'workflow 额外支持字段：步骤（JSON 数组，整体替换）、步骤操作、步骤序号、步骤名称、目标步骤序号、目标步骤名称、步骤内容、输出来源',
        'workflow 的“预览修改”会尽量展示常见字段的 before -> after（如 名称/启用/saveAs/地址/模式/提取/请求）',
        '多行值可使用：字段：<<<  ...  >>>',
    ];
}

function buildHelpText(): string {
    return [
        '插件管理（当前已支持 common / dynamic / workflow 完整管理）',
        '',
        ...buildHelpQuerySectionLines(),
        ...buildHelpPreviewSectionLines(),
        ...buildHelpWriteSectionLines(),
        ...buildHelpWriteExampleLines(),
        ...buildHelpWorkflowEditExampleLines(),
        ...buildHelpFieldNotesLines(),
    ].join('\n');
}

function isOwner(message: IncomingMessage, env: Env): boolean {
    const ownerId = env.BOT_OWNER_WECHAT_ID?.trim();
    return Boolean(ownerId) && message.from === ownerId;
}

function ensureOwner(message: IncomingMessage, env: Env): void {
    const ownerId = env.BOT_OWNER_WECHAT_ID?.trim();
    if (!ownerId) {
        throw new Error('BOT_OWNER_WECHAT_ID 未配置，无法使用插件管理命令');
    }
    if (!isOwner(message, env)) {
        throw new Error('无权限：仅机器人主人可使用插件管理命令。');
    }
}

function ensureImplementedCategory(category: RulePluginCategory): void {
    void category;
}

function ensureWorkflowWritePatchSupported(category: RulePluginCategory): void {
    void category;
}

function ensureWorkflowRenameCopySupported(category: RulePluginCategory): void {
    void category;
}

function getCategoryMeta(category: RulePluginCategory): PluginAdminCategoryMeta {
    return CATEGORY_META_MAP[category];
}

function buildInlineOverrideWarning(env: Env, category: RulePluginCategory): string | undefined {
    if (category !== 'common') return undefined;
    const hasInline = Boolean(env.COMMON_PLUGINS_CONFIG?.trim() || env.COMMON_PLUGINS_MAPPING?.trim());
    if (!hasInline) return undefined;
    return '警告：当前通用插件由环境变量内联配置接管，下面展示的是 KV 内容，不是实际生效规则。';
}

function ensureNoInlineOverrideForWrite(env: Env, category: RulePluginCategory): void {
    if (category !== 'common') return;
    if (env.COMMON_PLUGINS_CONFIG?.trim() || env.COMMON_PLUGINS_MAPPING?.trim()) {
        throw new Error([
            '当前通用插件由环境变量内联配置接管，聊天命令修改 KV 不会生效。',
            '请先切换到 KV 管理模式，再执行插件管理命令。',
        ].join('\n'));
    }
}

function parseRuleArray(rawText: string | null, keyName: string): Record<string, unknown>[] {
    if (!rawText?.trim()) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error(`${keyName} 中保存的规则不是合法 JSON，无法继续管理`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`${keyName} 中保存的规则不是数组，无法继续管理`);
    }

    return parsed.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`${keyName} 第 ${index + 1} 条规则不是对象，无法继续管理`);
        }
        return {...(item as Record<string, unknown>)};
    });
}

function buildCommonRulePatch(fields: CommonRuleInputPatch, requireAllFields: boolean): CommonRuleInputPatch {
    const patch: CommonRuleInputPatch = {};

    if (hasOwn(fields, 'name')) {
        patch.name = normalizeRuleName(fields.name);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：名称');
    }

    if (hasOwn(fields, 'keyword')) {
        const keyword = normalizeKeyword(fields.keyword);
        patch.keyword = Array.isArray(keyword) ? keyword.join('|') : keyword;
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：关键词');
    }

    if (hasOwn(fields, 'url')) {
        patch.url = normalizeHttpUrl(fields.url);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：地址');
    }

    if (hasOwn(fields, 'mode')) {
        patch.mode = normalizeMode(fields.mode);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：模式');
    }

    if (hasOwn(fields, 'rType')) {
        patch.rType = normalizeReplyType(fields.rType);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：回复');
    }

    if (hasOwn(fields, 'method')) {
        const methodText = normalizeOptionalString(fields.method);
        patch.method = methodText ? normalizeMethod(methodText) : undefined;
    }

    if (hasOwn(fields, 'jsonPath')) {
        patch.jsonPath = normalizeOptionalString(fields.jsonPath);
    }

    return patch;
}

function buildDynamicArgsConfig(fields: ArgsInputPatch): ArgsConfig | undefined {
    const hasArgsField = hasOwn(fields, 'argsMode')
        || hasOwn(fields, 'argsDelimiter')
        || hasOwn(fields, 'argsNames')
        || hasOwn(fields, 'argsRequired');
    if (!hasArgsField) return undefined;

    const argsConfig: ArgsConfig = {};
    if (hasOwn(fields, 'argsMode')) {
        const argsModeText = normalizeOptionalString(fields.argsMode);
        argsConfig.mode = argsModeText ? normalizeArgsModeStrict(argsModeText) : undefined;
    }
    if (hasOwn(fields, 'argsDelimiter')) {
        argsConfig.delimiter = normalizeOptionalString(fields.argsDelimiter);
    }
    if (hasOwn(fields, 'argsNames')) {
        argsConfig.names = normalizeOptionalPipeList(fields.argsNames, '参数名');
    }
    if (hasOwn(fields, 'argsRequired')) {
        argsConfig.required = normalizeOptionalPipeList(fields.argsRequired, '必填参数');
    }

    const names = argsConfig.names ?? [];
    const required = argsConfig.required ?? [];
    const unknownRequired = required.filter((item) => item !== 'all' && item !== 'keyword' && !/^\d+$/.test(item) && !names.includes(item));
    if (unknownRequired.length > 0) {
        throw new Error(`必填参数未在参数名中声明：${unknownRequired.join('、')}`);
    }

    return Object.values(argsConfig).some((value) => value !== undefined) ? argsConfig : undefined;
}

function buildDynamicRulePatch(fields: DynamicRuleInputPatch, requireAllFields: boolean): DynamicRuleInputPatch {
    const patch: DynamicRuleInputPatch = {};

    if (hasOwn(fields, 'name')) {
        patch.name = normalizeRuleName(fields.name);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：名称');
    }

    if (hasOwn(fields, 'keyword')) {
        const keywordText = normalizeOptionalString(fields.keyword);
        if (keywordText) {
            const keyword = normalizeKeyword(keywordText);
            patch.keyword = Array.isArray(keyword) ? keyword.join('|') : keyword;
        }
    }

    if (hasOwn(fields, 'pattern')) {
        patch.pattern = normalizeOptionalString(fields.pattern);
    }

    if (hasOwn(fields, 'url')) {
        patch.url = normalizeHttpUrl(fields.url);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：地址');
    }

    if (hasOwn(fields, 'mode')) {
        patch.mode = normalizeMode(fields.mode);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：模式');
    }

    if (hasOwn(fields, 'rType')) {
        patch.rType = normalizeReplyType(fields.rType);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：回复');
    }

    if (hasOwn(fields, 'method')) {
        const methodText = normalizeOptionalString(fields.method);
        patch.method = methodText ? normalizeMethod(methodText) : undefined;
    }

    if (hasOwn(fields, 'jsonPath')) {
        patch.jsonPath = normalizeOptionalString(fields.jsonPath);
    }

    if (hasOwn(fields, 'matchMode')) {
        const matchModeText = normalizeOptionalString(fields.matchMode);
        patch.matchMode = matchModeText ? normalizeMatchModeStrict(matchModeText) : undefined;
    }

    const inferredMatchMode = patch.matchMode ?? (!patch.keyword && patch.pattern ? 'regex' : undefined);
    if (inferredMatchMode) {
        patch.matchMode = inferredMatchMode;
    }

    const argsConfig = buildDynamicArgsConfig(fields);
    if (argsConfig) {
        patch.argsMode = argsConfig.mode;
        patch.argsDelimiter = argsConfig.delimiter;
        patch.argsNames = argsConfig.names?.join('|');
        patch.argsRequired = argsConfig.required?.join('|');
    }

    if (requireAllFields) {
        if (!patch.keyword && !patch.pattern) {
            throw new Error('dynamic 规则至少需要提供“关键词”或“正则”其中之一');
        }
        const effectiveMatchMode = patch.matchMode ?? 'contains';
        if (effectiveMatchMode === 'regex' && !patch.pattern) {
            throw new Error('当匹配模式为 regex 时，必须提供正则');
        }
        if (effectiveMatchMode !== 'regex' && !patch.keyword) {
            throw new Error('非 regex 匹配模式必须提供关键词');
        }
    }

    return patch;
}

function normalizeWorkflowStepsInput(value: unknown): WorkflowCommonRule['steps'] {
    let parsed: unknown = value;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) {
            throw new Error('步骤不能为空');
        }
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error('步骤必须是合法 JSON 数组');
        }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('步骤必须是至少包含一个元素的 JSON 数组');
    }

    return parsed.map((step, index) => validateWorkflowStep(step, index));
}

function normalizeWorkflowStepAction(value: unknown): WorkflowStepEditAction {
    const action = normalizeNonEmptyString(value, '步骤操作').toLowerCase();
    switch (action) {
        case '追加':
        case 'append':
            return 'append';
        case '插入':
        case 'insert':
            return 'insert';
        case '修改':
        case 'update':
            return 'update';
        case '删除':
        case 'delete':
            return 'delete';
        case '移动':
        case 'move':
            return 'move';
        case '重命名':
        case 'rename':
            return 'rename';
        case '复制':
        case 'copy':
            return 'copy';
        case '启用':
        case 'enable':
            return 'enable';
        case '禁用':
        case 'disable':
            return 'disable';
        default:
            throw new Error('步骤操作仅支持 追加/插入/修改/删除/移动/重命名/复制/启用/禁用');
    }
}

function normalizeWorkflowStepIndex(value: unknown): number {
    const text = normalizeNonEmptyString(value, '步骤序号');
    const index = Number(text);
    if (!Number.isInteger(index) || index < 1) {
        throw new Error('步骤序号必须是大于等于 1 的整数');
    }
    return index;
}

function normalizeWorkflowStepName(value: unknown): string {
    return normalizeNonEmptyString(value, '步骤名称');
}

function normalizeWorkflowStepTargetIndex(value: unknown): number {
    const text = normalizeNonEmptyString(value, '目标步骤序号');
    const index = Number(text);
    if (!Number.isInteger(index) || index < 1) {
        throw new Error('目标步骤序号必须是大于等于 1 的整数');
    }
    return index;
}

function normalizeWorkflowStepTargetName(value: unknown): string {
    return normalizeNonEmptyString(value, '目标步骤名称');
}

function hasWorkflowStepEditFields(fields: WorkflowRuleWritePatch): boolean {
    return hasOwn(fields, 'stepAction')
        || hasOwn(fields, 'stepIndex')
        || hasOwn(fields, 'stepName')
        || hasOwn(fields, 'stepTargetIndex')
        || hasOwn(fields, 'stepTargetName')
        || hasOwn(fields, 'stepPayload');
}

function normalizeWorkflowStepSelectorInput(selector?: WorkflowStepSelectorInput): WorkflowStepSelector | undefined {
    if (!selector) return undefined;
    if (selector.view === 'steps-json' || selector.view === 'rule-json') {
        if (selector.stepIndex != null || selector.stepName != null) {
            throw new Error(`查看“${selector.view === 'rule-json' ? '规则JSON' : '步骤JSON'}”时不能同时提供步骤序号或步骤名称`);
        }
        return {view: selector.view};
    }
    const index = selector.stepIndex != null ? normalizeWorkflowStepIndex(selector.stepIndex) : undefined;
    const name = selector.stepName != null ? normalizeWorkflowStepName(selector.stepName) : undefined;
    if (index !== undefined && name) {
        throw new Error('查看步骤详情时不能同时提供步骤序号和步骤名称');
    }
    if (index === undefined && !name) {
        throw new Error('查看步骤详情时必须提供步骤序号或步骤名称');
    }
    return {index, name};
}

function resolveWorkflowStepSelectorIndex(
    steps: WorkflowCommonRule['steps'],
    stepEdit: WorkflowStepEditPatch | WorkflowStepSelector,
    actionLabel: '插入' | '修改' | '删除' | '移动' | '详情',
): number {
    if (stepEdit.index !== undefined && stepEdit.name) {
        throw new Error(actionLabel === '详情'
            ? '查看步骤详情时不能同时提供步骤序号和步骤名称'
            : `步骤操作为${actionLabel}时不能同时提供步骤序号和步骤名称`);
    }

    if (stepEdit.index !== undefined) {
        return stepEdit.index;
    }

    if (stepEdit.name) {
        const matchedIndexes = steps
            .map((step, index) => ({name: normalizeOptionalString(step.name), index: index + 1}))
            .filter((item) => item.name === stepEdit.name)
            .map((item) => item.index);
        if (matchedIndexes.length === 0) {
            throw new Error(`未找到步骤名称：${stepEdit.name}`);
        }
        if (matchedIndexes.length > 1) {
            throw new Error(`步骤名称不唯一：${stepEdit.name}，请改用步骤序号`);
        }
        return matchedIndexes[0];
    }

    throw new Error(actionLabel === '详情'
        ? '查看步骤详情时必须提供步骤序号或步骤名称'
        : `步骤操作为${actionLabel}时必须提供步骤序号或步骤名称`);
}

function buildWorkflowStepEditPatch(fields: WorkflowRuleWritePatch): WorkflowStepEditPatch | undefined {
    if (!hasWorkflowStepEditFields(fields)) return undefined;
    if (hasOwn(fields, 'steps')) {
        throw new Error('不能同时使用“步骤”和“步骤操作/步骤序号/步骤名称/目标步骤序号/目标步骤名称/步骤内容”，请二选一');
    }

    const action = hasOwn(fields, 'stepAction') ? normalizeWorkflowStepAction(fields.stepAction) : undefined;
    if (!action) {
        throw new Error('缺少必填字段：步骤操作');
    }

    const index = hasOwn(fields, 'stepIndex') ? normalizeWorkflowStepIndex(fields.stepIndex) : undefined;
    const name = hasOwn(fields, 'stepName') ? normalizeWorkflowStepName(fields.stepName) : undefined;
    const targetIndex = hasOwn(fields, 'stepTargetIndex') ? normalizeWorkflowStepTargetIndex(fields.stepTargetIndex) : undefined;
    const targetName = hasOwn(fields, 'stepTargetName') ? normalizeWorkflowStepTargetName(fields.stepTargetName) : undefined;
    const payload = hasOwn(fields, 'stepPayload') ? normalizeJsonObject(fields.stepPayload, '步骤内容') : undefined;

    switch (action) {
        case 'append':
            if (index !== undefined || name) {
                throw new Error('步骤操作为追加时不需要步骤序号或步骤名称');
            }
            if (targetIndex !== undefined) {
                throw new Error('步骤操作为追加时不需要目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为追加时不需要目标步骤名称');
            }
            if (!payload) {
                throw new Error('步骤操作为追加时必须提供步骤内容');
            }
            break;
        case 'insert':
            if (index === undefined) {
                throw new Error('步骤操作为插入时必须提供步骤序号');
            }
            if (name) {
                throw new Error('步骤操作为插入时不支持步骤名称，请使用步骤序号');
            }
            if (targetIndex !== undefined) {
                throw new Error('步骤操作为插入时不需要目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为插入时不需要目标步骤名称');
            }
            if (!payload) {
                throw new Error('步骤操作为插入时必须提供步骤内容');
            }
            break;
        case 'update':
            if (index !== undefined && name) {
                throw new Error('步骤操作为修改时不能同时提供步骤序号和步骤名称');
            }
            if (index === undefined && !name) {
                throw new Error('步骤操作为修改时必须提供步骤序号或步骤名称');
            }
            if (targetIndex !== undefined) {
                throw new Error('步骤操作为修改时不需要目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为修改时不需要目标步骤名称');
            }
            if (!payload) {
                throw new Error('步骤操作为修改时必须提供步骤内容');
            }
            break;
        case 'delete':
            if (index !== undefined && name) {
                throw new Error('步骤操作为删除时不能同时提供步骤序号和步骤名称');
            }
            if (index === undefined && !name) {
                throw new Error('步骤操作为删除时必须提供步骤序号或步骤名称');
            }
            if (targetIndex !== undefined) {
                throw new Error('步骤操作为删除时不需要目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为删除时不需要目标步骤名称');
            }
            if (payload) {
                throw new Error('步骤操作为删除时不需要步骤内容');
            }
            break;
        case 'move':
            if (index !== undefined && name) {
                throw new Error('步骤操作为移动时不能同时提供步骤序号和步骤名称');
            }
            if (index === undefined && !name) {
                throw new Error('步骤操作为移动时必须提供步骤序号或步骤名称');
            }
            if (targetIndex === undefined) {
                throw new Error('步骤操作为移动时必须提供目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为移动时不需要目标步骤名称');
            }
            if (payload) {
                throw new Error('步骤操作为移动时不需要步骤内容');
            }
            break;
        case 'rename':
            if (index !== undefined && name) {
                throw new Error('步骤操作为重命名时不能同时提供步骤序号和步骤名称');
            }
            if (index === undefined && !name) {
                throw new Error('步骤操作为重命名时必须提供步骤序号或步骤名称');
            }
            if (targetIndex !== undefined) {
                throw new Error('步骤操作为重命名时不需要目标步骤序号');
            }
            if (!targetName) {
                throw new Error('步骤操作为重命名时必须提供目标步骤名称');
            }
            if (payload) {
                throw new Error('步骤操作为重命名时不需要步骤内容');
            }
            break;
        case 'copy':
            if (index !== undefined && name) {
                throw new Error('步骤操作为复制时不能同时提供步骤序号和步骤名称');
            }
            if (index === undefined && !name) {
                throw new Error('步骤操作为复制时必须提供步骤序号或步骤名称');
            }
            if (targetIndex === undefined) {
                throw new Error('步骤操作为复制时必须提供目标步骤序号');
            }
            if (targetName) {
                throw new Error('步骤操作为复制时不需要目标步骤名称');
            }
            break;
        case 'enable':
        case 'disable':
            if (index !== undefined && name) {
                throw new Error(`步骤操作为${action === 'enable' ? '启用' : '禁用'}时不能同时提供步骤序号和步骤名称`);
            }
            if (index === undefined && !name) {
                throw new Error(`步骤操作为${action === 'enable' ? '启用' : '禁用'}时必须提供步骤序号或步骤名称`);
            }
            if (targetIndex !== undefined) {
                throw new Error(`步骤操作为${action === 'enable' ? '启用' : '禁用'}时不需要目标步骤序号`);
            }
            if (targetName) {
                throw new Error(`步骤操作为${action === 'enable' ? '启用' : '禁用'}时不需要目标步骤名称`);
            }
            if (payload) {
                throw new Error(`步骤操作为${action === 'enable' ? '启用' : '禁用'}时不需要步骤内容`);
            }
            break;
        default:
            break;
    }

    return {action, index, name, targetIndex, targetName, payload};
}

function buildWorkflowRulePatch(fields: WorkflowRuleWritePatch, requireAllFields: boolean): NormalizedWorkflowRulePatch {
    const patch: NormalizedWorkflowRulePatch = {};

    if (hasOwn(fields, 'name')) {
        patch.name = normalizeRuleName(fields.name);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：名称');
    }

    if (hasOwn(fields, 'keyword')) {
        const keywordText = normalizeOptionalString(fields.keyword);
        if (keywordText) {
            const keyword = normalizeKeyword(keywordText);
            patch.keyword = Array.isArray(keyword) ? keyword.join('|') : keyword;
        }
    }

    if (hasOwn(fields, 'pattern')) {
        patch.pattern = normalizeOptionalString(fields.pattern);
    }

    if (hasOwn(fields, 'matchMode')) {
        const matchModeText = normalizeOptionalString(fields.matchMode);
        patch.matchMode = matchModeText ? normalizeMatchModeStrict(matchModeText) : undefined;
    }

    const inferredMatchMode = patch.matchMode ?? (!patch.keyword && patch.pattern ? 'regex' : undefined);
    if (inferredMatchMode) {
        patch.matchMode = inferredMatchMode;
    }

    const argsConfig = buildDynamicArgsConfig(fields);
    if (argsConfig) {
        patch.argsMode = argsConfig.mode;
        patch.argsDelimiter = argsConfig.delimiter;
        patch.argsNames = argsConfig.names?.join('|');
        patch.argsRequired = argsConfig.required?.join('|');
    }

    if (hasOwn(fields, 'rType')) {
        patch.rType = normalizeReplyType(fields.rType);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：回复');
    }

    if (hasOwn(fields, 'steps')) {
        patch.steps = normalizeWorkflowStepsInput(fields.steps);
    } else if (requireAllFields) {
        throw new Error('缺少必填字段：步骤');
    }

    const stepEdit = buildWorkflowStepEditPatch(fields);
    if (stepEdit) {
        if (requireAllFields) {
            throw new Error('新增或检查 workflow 时不支持步骤操作，请使用“步骤”提供完整步骤数组');
        }
        patch.stepEdit = stepEdit;
    }

    if (hasOwn(fields, 'outputFrom')) {
        patch.outputFrom = normalizeOptionalString(fields.outputFrom);
    }

    if (requireAllFields) {
        if (!patch.keyword && !patch.pattern) {
            throw new Error('workflow 规则至少需要提供“关键词”或“正则”其中之一');
        }
        const effectiveMatchMode = patch.matchMode ?? 'contains';
        if (effectiveMatchMode === 'regex' && !patch.pattern) {
            throw new Error('当匹配模式为 regex 时，必须提供正则');
        }
        if (effectiveMatchMode !== 'regex' && !patch.keyword) {
            throw new Error('非 regex 匹配模式必须提供关键词');
        }
    }

    return patch;
}

function applyAdvancedFieldsToRule(
    nextRule: Record<string, unknown>,
    fields: CommonRuleInputPatch | DynamicRuleInputPatch | WorkflowRuleWritePatch,
    changedFields?: string[],
): void {
    if (hasOwn(fields, 'headers')) {
        const headers = normalizeHeadersValue(fields.headers);
        if (headers) {
            nextRule.headers = headers;
        } else if (hasOwn(nextRule, 'headers')) {
            delete nextRule.headers;
        }
        changedFields?.push('请求头');
    }
    if (hasOwn(fields, 'body')) {
        const body = normalizeJsonValue(fields.body, '请求体');
        if (body !== undefined) {
            nextRule.body = body;
        } else if (hasOwn(nextRule, 'body')) {
            delete nextRule.body;
        }
        changedFields?.push('请求体');
    }
    if (hasOwn(fields, 'linkTitle')) {
        const linkTitle = normalizeOptionalString(fields.linkTitle);
        if (linkTitle) {
            nextRule.linkTitle = linkTitle;
        } else if (hasOwn(nextRule, 'linkTitle')) {
            delete nextRule.linkTitle;
        }
        changedFields?.push('链接标题');
    }
    if (hasOwn(fields, 'linkDescription')) {
        const linkDescription = normalizeOptionalString(fields.linkDescription);
        if (linkDescription) {
            nextRule.linkDescription = linkDescription;
        } else if (hasOwn(nextRule, 'linkDescription')) {
            delete nextRule.linkDescription;
        }
        changedFields?.push('链接描述');
    }
    if (hasOwn(fields, 'linkPicUrl')) {
        const linkPicUrl = normalizeOptionalHttpUrl(fields.linkPicUrl, '链接图片');
        if (linkPicUrl) {
            nextRule.linkPicUrl = linkPicUrl;
        } else if (hasOwn(nextRule, 'linkPicUrl')) {
            delete nextRule.linkPicUrl;
        }
        changedFields?.push('链接图片');
    }
    if (hasOwn(fields, 'voiceFormat')) {
        const voiceFormat = normalizeOptionalInteger(fields.voiceFormat, '语音格式');
        if (voiceFormat !== undefined) {
            nextRule.voiceFormat = voiceFormat;
        } else if (hasOwn(nextRule, 'voiceFormat')) {
            delete nextRule.voiceFormat;
        }
        changedFields?.push('语音格式');
    }
    if (hasOwn(fields, 'voiceDurationMs')) {
        const voiceDurationMs = normalizeOptionalInteger(fields.voiceDurationMs, '语音时长');
        if (voiceDurationMs !== undefined) {
            nextRule.voiceDurationMs = voiceDurationMs;
        } else if (hasOwn(nextRule, 'voiceDurationMs')) {
            delete nextRule.voiceDurationMs;
        }
        changedFields?.push('语音时长');
    }
    if (hasOwn(fields, 'voiceFallbackText')) {
        const voiceFallbackText = normalizeOptionalString(fields.voiceFallbackText);
        if (voiceFallbackText) {
            nextRule.voiceFallbackText = voiceFallbackText;
        } else if (hasOwn(nextRule, 'voiceFallbackText')) {
            delete nextRule.voiceFallbackText;
        }
        changedFields?.push('语音降级文案');
    }
    if (hasOwn(fields, 'cardUsername')) {
        const cardUsername = normalizeOptionalString(fields.cardUsername);
        if (cardUsername) {
            nextRule.cardUsername = cardUsername;
        } else if (hasOwn(nextRule, 'cardUsername')) {
            delete nextRule.cardUsername;
        }
        changedFields?.push('卡片用户名');
    }
    if (hasOwn(fields, 'cardNickname')) {
        const cardNickname = normalizeOptionalString(fields.cardNickname);
        if (cardNickname) {
            nextRule.cardNickname = cardNickname;
        } else if (hasOwn(nextRule, 'cardNickname')) {
            delete nextRule.cardNickname;
        }
        changedFields?.push('卡片昵称');
    }
    if (hasOwn(fields, 'cardAlias')) {
        const cardAlias = normalizeOptionalString(fields.cardAlias);
        if (cardAlias) {
            nextRule.cardAlias = cardAlias;
        } else if (hasOwn(nextRule, 'cardAlias')) {
            delete nextRule.cardAlias;
        }
        changedFields?.push('卡片别名');
    }
    if (hasOwn(fields, 'appType')) {
        const appType = normalizeOptionalInteger(fields.appType, 'app类型');
        if (appType !== undefined) {
            nextRule.appType = appType;
        } else if (hasOwn(nextRule, 'appType')) {
            delete nextRule.appType;
        }
        changedFields?.push('app类型');
    }
    if (hasOwn(fields, 'appXml')) {
        const appXml = normalizeOptionalString(fields.appXml);
        if (appXml) {
            nextRule.appXml = appXml;
        } else if (hasOwn(nextRule, 'appXml')) {
            delete nextRule.appXml;
        }
        changedFields?.push('appXml');
    }
}

function applyCommonRulePatch(target: Record<string, unknown>, fields: CommonRuleInputPatch): {nextRule: Record<string, unknown>; changedFields: string[]} {
    const nextRule = {...target};
    const changedFields: string[] = [];
    const normalized = buildCommonRulePatch(fields, false);

    if (hasOwn(fields, 'name') && normalized.name !== target.name) {
        nextRule.name = normalized.name;
        changedFields.push('名称');
    }
    if (hasOwn(fields, 'keyword') && normalized.keyword !== target.keyword) {
        nextRule.keyword = normalized.keyword;
        changedFields.push('关键词');
    }
    if (hasOwn(fields, 'url') && normalized.url !== target.url) {
        nextRule.url = normalized.url;
        changedFields.push('地址');
    }
    if (hasOwn(fields, 'mode') && normalized.mode !== target.mode) {
        nextRule.mode = normalized.mode;
        changedFields.push('模式');
    }
    if (hasOwn(fields, 'rType') && normalized.rType !== target.rType) {
        nextRule.rType = normalized.rType;
        changedFields.push('回复');
    }
    if (hasOwn(fields, 'method')) {
        if (normalized.method) {
            if (normalized.method !== target.method) {
                nextRule.method = normalized.method;
                changedFields.push('请求');
            }
        } else if (hasOwn(nextRule, 'method')) {
            delete nextRule.method;
            changedFields.push('请求');
        }
    }
    if (hasOwn(fields, 'jsonPath')) {
        if (normalized.jsonPath) {
            if (normalized.jsonPath !== target.jsonPath) {
                nextRule.jsonPath = normalized.jsonPath;
                changedFields.push('提取');
            }
        } else if (hasOwn(nextRule, 'jsonPath')) {
            delete nextRule.jsonPath;
            changedFields.push('提取');
        }
    }

    applyAdvancedFieldsToRule(nextRule, fields, changedFields);

    return {nextRule, changedFields};
}

function applyDynamicRulePatch(target: Record<string, unknown>, fields: DynamicRuleInputPatch): {nextRule: Record<string, unknown>; changedFields: string[]} {
    const nextRule = {...target};
    const changedFields: string[] = [];
    const normalized = buildDynamicRulePatch(fields, false);

    if (hasOwn(fields, 'name') && normalized.name !== target.name) {
        nextRule.name = normalized.name;
        changedFields.push('名称');
    }
    if (hasOwn(fields, 'keyword')) {
        if (normalized.keyword !== target.keyword) {
            if (normalized.keyword) {
                nextRule.keyword = normalized.keyword;
            } else if (hasOwn(nextRule, 'keyword')) {
                delete nextRule.keyword;
            }
            changedFields.push('关键词');
        }
    }
    if (hasOwn(fields, 'pattern')) {
        if (normalized.pattern !== target.pattern) {
            if (normalized.pattern) {
                nextRule.pattern = normalized.pattern;
            } else if (hasOwn(nextRule, 'pattern')) {
                delete nextRule.pattern;
            }
            changedFields.push('正则');
        }
    }
    if (hasOwn(fields, 'matchMode')) {
        if (normalized.matchMode !== target.matchMode) {
            if (normalized.matchMode) {
                nextRule.matchMode = normalized.matchMode;
            } else if (hasOwn(nextRule, 'matchMode')) {
                delete nextRule.matchMode;
            }
            changedFields.push('匹配模式');
        }
    }
    if (hasOwn(fields, 'url') && normalized.url !== target.url) {
        nextRule.url = normalized.url;
        changedFields.push('地址');
    }
    if (hasOwn(fields, 'mode') && normalized.mode !== target.mode) {
        nextRule.mode = normalized.mode;
        changedFields.push('模式');
    }
    if (hasOwn(fields, 'rType') && normalized.rType !== target.rType) {
        nextRule.rType = normalized.rType;
        changedFields.push('回复');
    }
    if (hasOwn(fields, 'method')) {
        if (normalized.method) {
            if (normalized.method !== target.method) {
                nextRule.method = normalized.method;
                changedFields.push('请求');
            }
        } else if (hasOwn(nextRule, 'method')) {
            delete nextRule.method;
            changedFields.push('请求');
        }
    }
    if (hasOwn(fields, 'jsonPath')) {
        if (normalized.jsonPath) {
            if (normalized.jsonPath !== target.jsonPath) {
                nextRule.jsonPath = normalized.jsonPath;
                changedFields.push('提取');
            }
        } else if (hasOwn(nextRule, 'jsonPath')) {
            delete nextRule.jsonPath;
            changedFields.push('提取');
        }
    }

    const argsFieldsChanged = hasOwn(fields, 'argsMode') || hasOwn(fields, 'argsDelimiter') || hasOwn(fields, 'argsNames') || hasOwn(fields, 'argsRequired');
    if (argsFieldsChanged) {
        const argsPatch = buildDynamicArgsConfig(fields);
        const currentArgs = target.args && typeof target.args === 'object' && !Array.isArray(target.args)
            ? {...(target.args as ArgsConfig)}
            : {};
        const nextArgs = {...currentArgs};

        if (hasOwn(fields, 'argsMode')) nextArgs.mode = argsPatch?.mode;
        if (hasOwn(fields, 'argsDelimiter')) nextArgs.delimiter = argsPatch?.delimiter;
        if (hasOwn(fields, 'argsNames')) nextArgs.names = argsPatch?.names;
        if (hasOwn(fields, 'argsRequired')) nextArgs.required = argsPatch?.required;

        const hasAnyArgs = Object.values(nextArgs).some((value) => value !== undefined && (!Array.isArray(value) || value.length > 0));
        if (hasAnyArgs) {
            nextRule.args = nextArgs;
        } else if (hasOwn(nextRule, 'args')) {
            delete nextRule.args;
        }
        changedFields.push('参数配置');
    }

    applyAdvancedFieldsToRule(nextRule, fields, changedFields);

    return {nextRule, changedFields};
}

function applyWorkflowRulePatch(target: Record<string, unknown>, fields: WorkflowRuleWritePatch): {nextRule: Record<string, unknown>; changedFields: string[]} {
    const nextRule = {...target};
    const changedFields: string[] = [];
    const normalized = buildWorkflowRulePatch(fields, false);

    if (hasOwn(fields, 'name') && normalized.name !== target.name) {
        nextRule.name = normalized.name;
        changedFields.push('名称');
    }
    if (hasOwn(fields, 'keyword')) {
        if (normalized.keyword !== target.keyword) {
            if (normalized.keyword) {
                nextRule.keyword = normalized.keyword;
            } else if (hasOwn(nextRule, 'keyword')) {
                delete nextRule.keyword;
            }
            changedFields.push('关键词');
        }
    }
    if (hasOwn(fields, 'pattern')) {
        if (normalized.pattern !== target.pattern) {
            if (normalized.pattern) {
                nextRule.pattern = normalized.pattern;
            } else if (hasOwn(nextRule, 'pattern')) {
                delete nextRule.pattern;
            }
            changedFields.push('正则');
        }
    }
    if (hasOwn(fields, 'matchMode')) {
        if (normalized.matchMode !== target.matchMode) {
            if (normalized.matchMode) {
                nextRule.matchMode = normalized.matchMode;
            } else if (hasOwn(nextRule, 'matchMode')) {
                delete nextRule.matchMode;
            }
            changedFields.push('匹配模式');
        }
    }
    if (hasOwn(fields, 'rType') && normalized.rType !== target.rType) {
        nextRule.rType = normalized.rType;
        changedFields.push('回复');
    }

    if (normalized.stepEdit) {
        const currentSteps = Array.isArray(nextRule.steps)
            ? nextRule.steps.map((step, index) => validateWorkflowStep(step, index))
            : [];

        if (currentSteps.length === 0) {
            throw new Error('workflow 规则必须至少包含一个步骤');
        }

        const nextSteps = currentSteps.map((step) => ({...step}));
        switch (normalized.stepEdit.action) {
            case 'append':
                nextSteps.push(validateWorkflowStep(normalized.stepEdit.payload, nextSteps.length));
                break;
            case 'insert': {
                const insertIndex = normalized.stepEdit.index!;
                if (insertIndex > nextSteps.length + 1) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，插入位置仅支持 1-${nextSteps.length + 1}`);
                }
                nextSteps.splice(insertIndex - 1, 0, validateWorkflowStep(normalized.stepEdit.payload, insertIndex - 1));
                break;
            }
            case 'update': {
                const updateIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '修改');
                if (updateIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可修改范围 1-${nextSteps.length}`);
                }
                nextSteps[updateIndex - 1] = validateWorkflowStep(
                    {
                        ...nextSteps[updateIndex - 1],
                        ...normalized.stepEdit.payload,
                    },
                    updateIndex - 1,
                );
                break;
            }
            case 'delete': {
                const deleteIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '删除');
                if (deleteIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可删除范围 1-${nextSteps.length}`);
                }
                if (nextSteps.length === 1) {
                    throw new Error('workflow 至少需要保留一个步骤，不能删除最后一步');
                }
                nextSteps.splice(deleteIndex - 1, 1);
                break;
            }
            case 'move': {
                const moveFromIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '移动');
                if (moveFromIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可移动范围 1-${nextSteps.length}`);
                }
                const moveTargetIndex = normalized.stepEdit.targetIndex!;
                if (moveTargetIndex > nextSteps.length) {
                    throw new Error(`目标步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可移动到 1-${nextSteps.length}`);
                }
                if (moveFromIndex !== moveTargetIndex) {
                    const [movedStep] = nextSteps.splice(moveFromIndex - 1, 1);
                    nextSteps.splice(moveTargetIndex - 1, 0, movedStep);
                    changedFields.push('步骤');
                }
                break;
            }
            case 'rename': {
                const renameIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '修改');
                if (renameIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可修改范围 1-${nextSteps.length}`);
                }
                nextSteps[renameIndex - 1] = validateWorkflowStep(
                    {
                        ...nextSteps[renameIndex - 1],
                        name: normalized.stepEdit.targetName,
                    },
                    renameIndex - 1,
                );
                changedFields.push('步骤');
                break;
            }
            case 'copy': {
                const copyFromIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '修改');
                if (copyFromIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可复制范围 1-${nextSteps.length}`);
                }
                const copyTargetIndex = normalized.stepEdit.targetIndex!;
                if (copyTargetIndex > nextSteps.length + 1) {
                    throw new Error(`目标步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可复制到 1-${nextSteps.length + 1}`);
                }
                const copiedStep = validateWorkflowStep(
                    {
                        ...nextSteps[copyFromIndex - 1],
                        ...(normalized.stepEdit.payload ?? {}),
                    },
                    copyTargetIndex - 1,
                );
                nextSteps.splice(copyTargetIndex - 1, 0, copiedStep);
                changedFields.push('步骤');
                break;
            }
            case 'enable': {
                const enableIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '修改');
                if (enableIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可修改范围 1-${nextSteps.length}`);
                }
                nextSteps[enableIndex - 1] = validateWorkflowStep(
                    {
                        ...nextSteps[enableIndex - 1],
                        enabled: true,
                    },
                    enableIndex - 1,
                );
                changedFields.push('步骤');
                break;
            }
            case 'disable': {
                const disableIndex = resolveWorkflowStepSelectorIndex(nextSteps, normalized.stepEdit, '修改');
                if (disableIndex > nextSteps.length) {
                    throw new Error(`步骤序号超出范围：当前共有 ${nextSteps.length} 个步骤，可修改范围 1-${nextSteps.length}`);
                }
                nextSteps[disableIndex - 1] = validateWorkflowStep(
                    {
                        ...nextSteps[disableIndex - 1],
                        enabled: false,
                    },
                    disableIndex - 1,
                );
                changedFields.push('步骤');
                break;
            }
            default:
                break;
        }

        nextRule.steps = nextSteps.map((step, index) => validateWorkflowStep(step, index));
        if (normalized.stepEdit.action !== 'move'
            && normalized.stepEdit.action !== 'rename'
            && normalized.stepEdit.action !== 'copy'
            && normalized.stepEdit.action !== 'enable'
            && normalized.stepEdit.action !== 'disable') {
            changedFields.push('步骤');
        }
    }

    const argsFieldsChanged = hasOwn(fields, 'argsMode') || hasOwn(fields, 'argsDelimiter') || hasOwn(fields, 'argsNames') || hasOwn(fields, 'argsRequired');
    if (argsFieldsChanged) {
        const argsPatch = buildDynamicArgsConfig(fields);
        const currentArgs = target.args && typeof target.args === 'object' && !Array.isArray(target.args)
            ? {...(target.args as ArgsConfig)}
            : {};
        const nextArgs = {...currentArgs};

        if (hasOwn(fields, 'argsMode')) nextArgs.mode = argsPatch?.mode;
        if (hasOwn(fields, 'argsDelimiter')) nextArgs.delimiter = argsPatch?.delimiter;
        if (hasOwn(fields, 'argsNames')) nextArgs.names = argsPatch?.names;
        if (hasOwn(fields, 'argsRequired')) nextArgs.required = argsPatch?.required;

        const hasAnyArgs = Object.values(nextArgs).some((value) => value !== undefined && (!Array.isArray(value) || value.length > 0));
        if (hasAnyArgs) {
            nextRule.args = nextArgs;
        } else if (hasOwn(nextRule, 'args')) {
            delete nextRule.args;
        }
        changedFields.push('参数配置');
    }

    if (hasOwn(fields, 'steps')) {
        if (JSON.stringify(normalized.steps) !== JSON.stringify(target.steps)) {
            nextRule.steps = normalized.steps;
            changedFields.push('步骤');
        }
    }
    if (hasOwn(fields, 'outputFrom')) {
        if (normalized.outputFrom !== target.outputFrom) {
            if (normalized.outputFrom) {
                nextRule.outputFrom = normalized.outputFrom;
            } else if (hasOwn(nextRule, 'outputFrom')) {
                delete nextRule.outputFrom;
            }
            changedFields.push('输出来源');
        }
    }

    applyAdvancedFieldsToRule(nextRule, fields, changedFields);

    return {nextRule, changedFields};
}

function validateCommonRuleRecord(rawRule: Record<string, unknown>): CommonPluginRule {
    const name = normalizeRuleName(rawRule.name);
    const keyword = normalizeKeyword(rawRule.keyword);
    const url = normalizeHttpUrl(rawRule.url);
    const mode = normalizeMode(rawRule.mode);
    const rType = normalizeReplyType(rawRule.rType);
    const methodText = normalizeOptionalString(rawRule.method);
    const jsonPath = normalizeOptionalString(rawRule.jsonPath);

    const normalizedRule = {
        name,
        keyword,
        url,
        mode,
        rType,
        method: methodText ? normalizeMethod(methodText) : undefined,
        jsonPath,
        headers: normalizeHeadersValue(rawRule.headers),
        body: normalizeJsonValue(rawRule.body, '请求体'),
        linkTitle: normalizeOptionalString(rawRule.linkTitle),
        linkDescription: normalizeOptionalString(rawRule.linkDescription),
        linkPicUrl: normalizeOptionalHttpUrl(rawRule.linkPicUrl, '链接图片'),
        voiceFormat: normalizeOptionalInteger(rawRule.voiceFormat, '语音格式'),
        voiceDurationMs: normalizeOptionalInteger(rawRule.voiceDurationMs, '语音时长'),
        voiceFallbackText: normalizeOptionalString(rawRule.voiceFallbackText),
        cardUsername: normalizeOptionalString(rawRule.cardUsername),
        cardNickname: normalizeOptionalString(rawRule.cardNickname),
        cardAlias: normalizeOptionalString(rawRule.cardAlias),
        appType: normalizeOptionalInteger(rawRule.appType, 'app类型'),
        appXml: normalizeOptionalString(rawRule.appXml),
    } satisfies CommonPluginRule;

    validateReplySpecificFields(normalizedRule);
    return normalizedRule;
}

function validateDynamicRuleRecord(rawRule: Record<string, unknown>): DynamicCommonRule {
    const name = normalizeRuleName(rawRule.name);
    const keyword = hasOwn(rawRule, 'keyword') ? normalizeKeyword(rawRule.keyword) : undefined;
    const pattern = normalizeOptionalString(rawRule.pattern);
    const url = normalizeHttpUrl(rawRule.url);
    const mode = normalizeMode(rawRule.mode);
    const rType = normalizeReplyType(rawRule.rType);
    const methodText = normalizeOptionalString(rawRule.method);
    const jsonPath = normalizeOptionalString(rawRule.jsonPath);
    const matchMode = hasOwn(rawRule, 'matchMode') && normalizeOptionalString(rawRule.matchMode)
        ? normalizeMatchModeStrict(rawRule.matchMode)
        : (pattern && !keyword ? 'regex' : 'contains');

    if (matchMode === 'regex') {
        if (!pattern) {
            throw new Error('匹配模式为 regex 时必须提供正则');
        }
        try {
            new RegExp(pattern);
        } catch {
            throw new Error('正则表达式无效');
        }
    } else if (!keyword || normalizeMatchKeywords(keyword).length === 0) {
        throw new Error('非 regex 动态规则必须提供关键词');
    }

    const args = rawRule.args && typeof rawRule.args === 'object' && !Array.isArray(rawRule.args)
        ? {...(rawRule.args as ArgsConfig)}
        : undefined;

    if (args?.mode && !SUPPORTED_DYNAMIC_ARGS_MODES.has(args.mode)) {
        throw new Error('参数模式仅支持 tail/split/regex');
    }
    if (args?.mode === 'regex' && matchMode !== 'regex') {
        throw new Error('参数模式为 regex 时，匹配模式也必须为 regex');
    }
    if (args?.names?.some((item) => !item.trim())) {
        throw new Error('参数名不能为空');
    }
    if (args?.required?.some((item) => !item.trim())) {
        throw new Error('必填参数不能为空');
    }
    if (args?.required?.length) {
        const names = args.names ?? [];
        const unknownRequired = args.required.filter((item) => item !== 'all' && item !== 'keyword' && !/^\d+$/.test(item) && !names.includes(item));
        if (unknownRequired.length > 0) {
            throw new Error(`必填参数未在参数名中声明：${unknownRequired.join('、')}`);
        }
    }

    const normalizedRule = {
        name,
        keyword,
        pattern,
        matchMode,
        url,
        mode,
        rType,
        method: methodText ? normalizeMethod(methodText) : undefined,
        jsonPath,
        args,
        headers: normalizeHeadersValue(rawRule.headers),
        body: normalizeJsonValue(rawRule.body, '请求体'),
        linkTitle: normalizeOptionalString(rawRule.linkTitle),
        linkDescription: normalizeOptionalString(rawRule.linkDescription),
        linkPicUrl: normalizeOptionalHttpUrl(rawRule.linkPicUrl, '链接图片'),
        voiceFormat: normalizeOptionalInteger(rawRule.voiceFormat, '语音格式'),
        voiceDurationMs: normalizeOptionalInteger(rawRule.voiceDurationMs, '语音时长'),
        voiceFallbackText: normalizeOptionalString(rawRule.voiceFallbackText),
        cardUsername: normalizeOptionalString(rawRule.cardUsername),
        cardNickname: normalizeOptionalString(rawRule.cardNickname),
        cardAlias: normalizeOptionalString(rawRule.cardAlias),
        appType: normalizeOptionalInteger(rawRule.appType, 'app类型'),
        appXml: normalizeOptionalString(rawRule.appXml),
    } satisfies DynamicCommonRule;

    validateReplySpecificFields(normalizedRule);
    return normalizedRule;
}

function validateWorkflowStep(rawStep: unknown, index: number): WorkflowCommonRule['steps'][number] {
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
        throw new Error(`第 ${index + 1} 个步骤不是对象`);
    }

    const step = rawStep as Record<string, unknown>;
    const url = normalizeHttpUrl(step.url);
    const mode = normalizeMode(step.mode);
    const methodText = normalizeOptionalString(step.method);
    const jsonPath = normalizeOptionalString(step.jsonPath);
    const saveAs = normalizeOptionalString(step.saveAs);
    const name = normalizeOptionalString(step.name);
    const enabled = typeof step.enabled === 'boolean' ? step.enabled : undefined;
    const headers = step.headers as Record<string, unknown> | undefined;
    const normalizedHeaders: Record<string, string> | undefined = headers ? {} : undefined;

    if (headers) {
        for (const [headerKey, headerValue] of Object.entries(headers)) {
            if (typeof headerValue !== 'string') {
                throw new Error(`第 ${index + 1} 个步骤的 headers.${headerKey} 必须是字符串`);
            }
            normalizedHeaders![headerKey] = headerValue;
        }
    }

    return {
        ...(name ? {name} : {}),
        ...(enabled !== undefined ? {enabled} : {}),
        url,
        mode,
        ...(methodText ? {method: normalizeMethod(methodText)} : {}),
        ...(jsonPath ? {jsonPath} : {}),
        ...(saveAs ? {saveAs} : {}),
        ...(normalizedHeaders ? {headers: normalizedHeaders} : {}),
        ...(hasOwn(step, 'body') ? {body: step.body} : {}),
    };
}

function validateWorkflowRuleRecord(rawRule: Record<string, unknown>): WorkflowCommonRule {
    const name = normalizeRuleName(rawRule.name);
    const keyword = hasOwn(rawRule, 'keyword') ? normalizeKeyword(rawRule.keyword) : undefined;
    const pattern = normalizeOptionalString(rawRule.pattern);
    const matchMode = hasOwn(rawRule, 'matchMode') && normalizeOptionalString(rawRule.matchMode)
        ? normalizeMatchModeStrict(rawRule.matchMode)
        : (pattern && !keyword ? 'regex' : 'contains');
    const rType = normalizeReplyType(rawRule.rType);
    const mode = normalizeOptionalString(rawRule.mode)?.toLowerCase() ?? 'workflow';
    if (mode !== 'workflow') {
        throw new Error('workflow 规则的 mode 必须为 workflow');
    }

    if (matchMode === 'regex') {
        if (!pattern) {
            throw new Error('匹配模式为 regex 时必须提供正则');
        }
        try {
            new RegExp(pattern);
        } catch {
            throw new Error('正则表达式无效');
        }
    } else if (!keyword || normalizeMatchKeywords(keyword).length === 0) {
        throw new Error('非 regex workflow 规则必须提供关键词');
    }

    const args = rawRule.args && typeof rawRule.args === 'object' && !Array.isArray(rawRule.args)
        ? {...(rawRule.args as ArgsConfig)}
        : undefined;
    if (args?.mode && !SUPPORTED_DYNAMIC_ARGS_MODES.has(args.mode)) {
        throw new Error('参数模式仅支持 tail/split/regex');
    }
    if (args?.mode === 'regex' && matchMode !== 'regex') {
        throw new Error('参数模式为 regex 时，匹配模式也必须为 regex');
    }
    if (args?.names?.some((item) => !item.trim())) {
        throw new Error('参数名不能为空');
    }
    if (args?.required?.some((item) => !item.trim())) {
        throw new Error('必填参数不能为空');
    }
    if (args?.required?.length) {
        const names = args.names ?? [];
        const unknownRequired = args.required.filter((item) => item !== 'all' && item !== 'keyword' && !/^\d+$/.test(item) && !names.includes(item));
        if (unknownRequired.length > 0) {
            throw new Error(`必填参数未在参数名中声明：${unknownRequired.join('、')}`);
        }
    }

    if (!Array.isArray(rawRule.steps) || rawRule.steps.length === 0) {
        throw new Error('workflow 规则必须至少包含一个步骤');
    }
    const steps = rawRule.steps.map((step: unknown, index: number) => validateWorkflowStep(step, index));
    const outputFrom = normalizeOptionalString(rawRule.outputFrom);
    if (outputFrom) {
        const saveAsSet = new Set(
            steps
                .filter((step) => step.enabled !== false)
                .map((step) => normalizeOptionalString(step.saveAs))
                .filter((value): value is string => Boolean(value)),
        );
        if (!saveAsSet.has(outputFrom)) {
            throw new Error(`outputFrom 未指向任何 saveAs 步骤：${outputFrom}`);
        }
    }

    const normalizedRule = {
        name,
        keyword,
        pattern,
        matchMode,
        mode: 'workflow',
        rType,
        args,
        linkTitle: normalizeOptionalString(rawRule.linkTitle),
        linkDescription: normalizeOptionalString(rawRule.linkDescription),
        linkPicUrl: normalizeOptionalHttpUrl(rawRule.linkPicUrl, '链接图片'),
        voiceFormat: typeof rawRule.voiceFormat === 'number' ? rawRule.voiceFormat : normalizeOptionalInteger(rawRule.voiceFormat, '语音格式'),
        voiceDurationMs: typeof rawRule.voiceDurationMs === 'number' ? rawRule.voiceDurationMs : normalizeOptionalInteger(rawRule.voiceDurationMs, '语音时长'),
        voiceFallbackText: normalizeOptionalString(rawRule.voiceFallbackText),
        cardUsername: normalizeOptionalString(rawRule.cardUsername),
        cardNickname: normalizeOptionalString(rawRule.cardNickname),
        cardAlias: normalizeOptionalString(rawRule.cardAlias),
        appType: typeof rawRule.appType === 'number' ? rawRule.appType : normalizeOptionalInteger(rawRule.appType, 'app类型'),
        appXml: normalizeOptionalString(rawRule.appXml),
        steps,
        outputFrom,
    } satisfies WorkflowCommonRule;

    validateReplySpecificFields(normalizedRule);
    return normalizedRule;
}

function validateCommonRules(rawRules: Record<string, unknown>[]): CommonPluginRule[] {
    const seenNames = new Set<string>();
    return rawRules.map((rawRule, index) => {
        let normalized: CommonPluginRule;
        try {
            normalized = validateCommonRuleRecord(rawRule);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`第 ${index + 1} 条规则校验失败：${message}`);
        }

        const normalizedName = normalized.name!.trim();
        if (seenNames.has(normalizedName)) {
            throw new Error(`规则名称重复：${normalizedName}`);
        }
        seenNames.add(normalizedName);
        return normalized;
    });
}

function validateDynamicRules(rawRules: Record<string, unknown>[]): DynamicCommonRule[] {
    const seenNames = new Set<string>();
    return rawRules.map((rawRule, index) => {
        let normalized: DynamicCommonRule;
        try {
            normalized = validateDynamicRuleRecord(rawRule);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`第 ${index + 1} 条动态规则校验失败：${message}`);
        }

        const normalizedName = normalized.name!.trim();
        if (seenNames.has(normalizedName)) {
            throw new Error(`规则名称重复：${normalizedName}`);
        }
        seenNames.add(normalizedName);
        return normalized;
    });
}

function validateWorkflowRules(rawRules: Record<string, unknown>[]): WorkflowCommonRule[] {
    const seenNames = new Set<string>();
    return rawRules.map((rawRule, index) => {
        let normalized: WorkflowCommonRule;
        try {
            normalized = validateWorkflowRuleRecord(rawRule);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`第 ${index + 1} 条 workflow 规则校验失败：${message}`);
        }

        const normalizedName = normalized.name!.trim();
        if (seenNames.has(normalizedName)) {
            throw new Error(`规则名称重复：${normalizedName}`);
        }
        seenNames.add(normalizedName);
        return normalized;
    });
}

function validateRulesByCategory(category: RulePluginCategory, rawRules: Record<string, unknown>[]): Array<CommonPluginRule | DynamicCommonRule | WorkflowCommonRule> {
    if (category === 'dynamic') return validateDynamicRules(rawRules);
    if (category === 'workflow') return validateWorkflowRules(rawRules);
    return validateCommonRules(rawRules);
}

async function readRawRules(env: Env, category: RulePluginCategory): Promise<Record<string, unknown>[]> {
    const meta = getCategoryMeta(category);
    const raw = await env.XBOT_KV.get(meta.liveKey);
    return parseRuleArray(raw, meta.liveKey);
}

async function writeRawRules(env: Env, category: RulePluginCategory, rawRules: Record<string, unknown>[]): Promise<void> {
    const meta = getCategoryMeta(category);
    await env.XBOT_KV.put(meta.liveKey, JSON.stringify(rawRules, null, 4));
}

async function backupRawRules(env: Env, category: RulePluginCategory, rawRules: Record<string, unknown>[]): Promise<void> {
    const meta = getCategoryMeta(category);
    await env.XBOT_KV.put(meta.backupKey, JSON.stringify(rawRules, null, 4));
}

async function readBackupRules(env: Env, category: RulePluginCategory): Promise<Record<string, unknown>[]> {
    const meta = getCategoryMeta(category);
    const raw = await env.XBOT_KV.get(meta.backupKey);
    if (!raw?.trim()) {
        throw new Error(`当前没有可回滚的 ${category} 备份`);
    }
    return parseRuleArray(raw, meta.backupKey);
}

function findRuleIndexByName(rawRules: Record<string, unknown>[], name: string): number {
    return rawRules.findIndex((rule) => normalizeOptionalString(rule.name) === name);
}

function buildListText(category: RulePluginCategory, rawRules: Record<string, unknown>[], warning?: string): string {
    if (rawRules.length === 0) {
        return `${formatWarningPrefix(warning)}当前 ${category} 分类还没有任何 KV 规则。`;
    }

    const lines = rawRules.map((rule, index) => buildRulePreviewLine(rule, index));

    return [
        formatWarningPrefix(warning).trimEnd(),
        `当前 ${category} 分类规则：${rawRules.length} 条`,
        ...lines,
    ].filter(Boolean).join('\n');
}

function buildSearchText(category: RulePluginCategory, rawRules: Record<string, unknown>[], query: string, warning?: string): string {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        throw new Error('搜索关键字不能为空');
    }

    const matchedRules = rawRules.filter((rule) => {
        const name = normalizeOptionalString(rule.name)?.toLowerCase() ?? '';
        const matcher = matcherPreview(rule).toLowerCase();
        return name.includes(normalizedQuery) || matcher.includes(normalizedQuery);
    });

    if (matchedRules.length === 0) {
        return `${formatWarningPrefix(warning)}未找到匹配“${query.trim()}”的 ${category} 规则。`;
    }

    const lines = matchedRules.map((rule, index) => buildRulePreviewLine(rule, index));

    return [
        formatWarningPrefix(warning).trimEnd(),
        `搜索结果：${category} / ${query.trim()} （共 ${matchedRules.length} 条）`,
        ...lines,
    ].filter(Boolean).join('\n');
}

function buildDetailText(category: RulePluginCategory, rule: Record<string, unknown>, warning?: string): string {
    const lines = [
        formatWarningPrefix(warning).trimEnd(),
        `规则详情（${category}）`,
        '',
        '基础信息',
        `- 名称：${normalizeOptionalString(rule.name) ?? '（未命名）'}`,
        `- 模式：${normalizeOptionalString(rule.mode) ?? '（空）'}`,
        `- 回复：${normalizeOptionalString(rule.rType) ?? '（空）'}`,
        '',
        '匹配信息',
        `- 匹配：${matcherPreview(rule)}`,
    ].filter(Boolean);

    const method = normalizeOptionalString(rule.method);
    const jsonPath = normalizeOptionalString(rule.jsonPath);
    const matchMode = normalizeOptionalString(rule.matchMode);
    const args = rule.args && typeof rule.args === 'object' && !Array.isArray(rule.args) ? rule.args as ArgsConfig : undefined;
    const steps = Array.isArray(rule.steps) ? rule.steps : undefined;
    const outputFrom = normalizeOptionalString(rule.outputFrom);
    if (matchMode) lines.push(`- 匹配模式：${matchMode}`);
    if (args?.mode) lines.push(`- 参数模式：${args.mode}`);
    if (args?.delimiter) lines.push(`- 参数分隔符：${args.delimiter}`);
    if (args?.names?.length) lines.push(`- 参数名：${args.names.join('|')}`);
    if (args?.required?.length) lines.push(`- 必填参数：${args.required.join('|')}`);

    const hasRequestInfo = Boolean(normalizeOptionalString(rule.url) || method || jsonPath || rule.headers || hasOwn(rule, 'body'));
    if (hasRequestInfo) {
        lines.push('', '请求信息');
        if (normalizeOptionalString(rule.url)) lines.push(`- 地址：${normalizeOptionalString(rule.url)}`);
        if (method) lines.push(`- 请求：${method}`);
        if (jsonPath) lines.push(`- 提取：${jsonPath}`);
        if (rule.headers) pushDetailValueBlock(lines, '请求头', rule.headers);
        if (hasOwn(rule, 'body')) pushDetailValueBlock(lines, '请求体', rule.body);
    }

    const hasReplyAdvanced = Boolean(
        normalizeOptionalString(rule.linkTitle)
        || normalizeOptionalString(rule.linkDescription)
        || normalizeOptionalString(rule.linkPicUrl)
        || rule.voiceFormat != null
        || rule.voiceDurationMs != null
        || normalizeOptionalString(rule.voiceFallbackText)
        || normalizeOptionalString(rule.cardUsername)
        || normalizeOptionalString(rule.cardNickname)
        || normalizeOptionalString(rule.cardAlias)
        || rule.appType != null
        || normalizeOptionalString(rule.appXml)
    );
    if (hasReplyAdvanced) {
        lines.push('', '回复扩展信息');
        if (normalizeOptionalString(rule.linkTitle)) lines.push(`- 链接标题：${normalizeOptionalString(rule.linkTitle)}`);
        if (normalizeOptionalString(rule.linkDescription)) lines.push(`- 链接描述：${normalizeOptionalString(rule.linkDescription)}`);
        if (normalizeOptionalString(rule.linkPicUrl)) lines.push(`- 链接图片：${normalizeOptionalString(rule.linkPicUrl)}`);
        if (rule.voiceFormat != null) lines.push(`- 语音格式：${String(rule.voiceFormat)}`);
        if (rule.voiceDurationMs != null) lines.push(`- 语音时长：${String(rule.voiceDurationMs)}`);
        if (normalizeOptionalString(rule.voiceFallbackText)) lines.push(`- 语音降级文案：${normalizeOptionalString(rule.voiceFallbackText)}`);
        if (normalizeOptionalString(rule.cardUsername)) lines.push(`- 卡片用户名：${normalizeOptionalString(rule.cardUsername)}`);
        if (normalizeOptionalString(rule.cardNickname)) lines.push(`- 卡片昵称：${normalizeOptionalString(rule.cardNickname)}`);
        if (normalizeOptionalString(rule.cardAlias)) lines.push(`- 卡片别名：${normalizeOptionalString(rule.cardAlias)}`);
        if (rule.appType != null) lines.push(`- app类型：${String(rule.appType)}`);
        if (normalizeOptionalString(rule.appXml)) pushDetailValueBlock(lines, 'appXml', normalizeOptionalString(rule.appXml));
    }

    if (steps) {
        lines.push('', '工作流信息', `- 步骤数：${steps.length}`);
        if (outputFrom) lines.push(`- 输出来源：${outputFrom}`);
        for (const [index, step] of steps.entries()) {
            lines.push(`- 步骤${index + 1}：${step.name ?? '（未命名）'}`);
            lines.push(`  - 模式：${step.mode}`);
            lines.push(`  - 地址：${step.url}`);
            lines.push(`  - 启用：${step.enabled === false ? '否' : '是'}`);
            if (step.saveAs) lines.push(`  - saveAs：${step.saveAs}`);
        }
        pushDetailValueBlock(lines, '步骤原始JSON', steps);
    }

    lines.push('', '原始配置：');
    lines.push(...formatUnknownValueExpanded(rule).split('\n').map((line) => `  ${line}`));
    return lines.join('\n');
}

function buildWorkflowStepDetailText(rule: WorkflowCommonRule, stepIndex: number, warning?: string): string {
    const step = rule.steps[stepIndex - 1];
    const lines = [
        formatWarningPrefix(warning).trimEnd(),
        '规则步骤详情（workflow）',
        '',
        `- 规则名称：${rule.name ?? '（未命名）'}`,
        `- 步骤序号：${stepIndex}`,
        `- 步骤名称：${step.name ?? '（未命名）'}`,
        `- 启用：${step.enabled === false ? '否' : '是'}`,
        `- 地址：${step.url}`,
        `- 模式：${step.mode}`,
        `- 请求：${step.method ?? 'GET'}`,
    ].filter(Boolean);

    if (step.jsonPath) lines.push(`- 提取：${step.jsonPath}`);
    if (step.saveAs) lines.push(`- saveAs：${step.saveAs}`);
    if (rule.outputFrom) lines.push(`- 当前规则输出来源：${rule.outputFrom}`);
    lines.push(`- 是否命中输出来源：${step.saveAs && rule.outputFrom === step.saveAs ? '是' : '否'}`);
    if (step.headers) pushDetailValueBlock(lines, '请求头', step.headers);
    if (Object.prototype.hasOwnProperty.call(step, 'body')) pushDetailValueBlock(lines, '请求体', step.body);
    lines.push('', '原始步骤：');
    lines.push(...formatUnknownValueExpanded(step).split('\n').map((line) => `  ${line}`));
    return lines.join('\n');
}

function buildWorkflowStepsJsonText(rule: Record<string, unknown>, warning?: string): string {
    const steps = Array.isArray(rule.steps) ? rule.steps : [];
    return [
        formatWarningPrefix(warning).trimEnd(),
        '规则步骤原始JSON（workflow）',
        `- 规则名称：${normalizeOptionalString(rule.name) ?? '（未命名）'}`,
        `- 步骤数：${steps.length}`,
        '',
        JSON.stringify(steps, null, 2),
    ].filter(Boolean).join('\n');
}

function buildWorkflowRuleJsonText(rule: Record<string, unknown>, warning?: string): string {
    return [
        formatWarningPrefix(warning).trimEnd(),
        '规则原始JSON（workflow）',
        `- 规则名称：${normalizeOptionalString(rule.name) ?? '（未命名）'}`,
        '',
        JSON.stringify(rule, null, 2),
    ].filter(Boolean).join('\n');
}

function buildRuleSummaryLines(rule: Record<string, unknown>): string[] {
    const lines = [
        `- 名称：${normalizeOptionalString(rule.name) ?? ''}`,
        `- 匹配：${matcherPreview(rule)}`,
        `- 模式：${normalizeOptionalString(rule.mode) ?? ''}`,
        `- 回复：${normalizeOptionalString(rule.rType) ?? ''}`,
    ];

    const url = normalizeOptionalString(rule.url);
    if (url) {
        lines.splice(2, 0, `- 地址：${url}`);
    }

    const steps = Array.isArray(rule.steps) ? rule.steps : undefined;
    if (steps) {
        lines.push(`- 步骤数：${steps.length}`);
    }

    const outputFrom = normalizeOptionalString(rule.outputFrom);
    if (outputFrom) {
        lines.push(`- 输出来源：${outputFrom}`);
    }

    return lines;
}

function buildCheckSuccessText(category: RulePluginCategory, previewRule: Record<string, unknown>): string {
    return [
        `规则校验通过（${category}）`,
        ...buildRuleSummaryLines(previewRule),
        '',
        '本次仅校验，未写入 KV。',
    ].join('\n');
}

function buildPreviewText(
    title: string,
    category: RulePluginCategory,
    bodyLines: string[],
    warning?: string,
    confirmCommand?: string,
): string {
    return [
        formatWarningPrefix(warning).trimEnd(),
        `${title}（未写入）`,
        `- 分类：${category}`,
        ...bodyLines,
        '',
        '本次仅预览，未写入 KV。',
        confirmCommand ? `如确认执行，请发送：${confirmCommand}` : undefined,
    ].filter(Boolean).join('\n');
}

function buildDeletePreviewText(category: RulePluginCategory, rule: Record<string, unknown>, warning?: string): string {
    const targetName = normalizeOptionalString(rule.name) ?? '（未命名）';
    return buildPreviewText(
        '规则预览删除',
        category,
        buildRuleSummaryLines(rule),
        warning,
        `插件管理 确认删除 ${category} ${targetName}`,
    );
}

function buildCopyPreviewText(
    category: RulePluginCategory,
    sourceName: string,
    targetName: string,
    rule: Record<string, unknown>,
    warning?: string,
): string {
    const steps = Array.isArray(rule.steps) ? rule.steps : [];
    const lines = [
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        ...buildRuleSummaryLines(rule),
    ];

    if (steps.length > 0) {
        lines.push('', '步骤预览：');
        for (const [index, step] of steps.entries()) {
            lines.push(`- 步骤${index + 1}：${summarizeWorkflowStepForDiff(step as Record<string, unknown>)}`);
        }
    }

    return buildPreviewText('规则预览复制', category, lines, warning, `插件管理 复制 ${category} ${sourceName} ${targetName}`);
}

function buildRenamePreviewText(
    category: RulePluginCategory,
    sourceName: string,
    targetName: string,
    rule: Record<string, unknown>,
    warning?: string,
): string {
    return buildPreviewText('规则预览重命名', category, [
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        ...buildRuleSummaryLines(rule),
    ], warning, `插件管理 重命名 ${category} ${sourceName} ${targetName}`);
}

function buildAddSuccessText(category: RulePluginCategory, rule: Record<string, unknown>, clearedCount: number): string {
    return [
        '插件已添加成功',
        `- 分类：${category}`,
        ...buildRuleSummaryLines(rule),
        '',
        `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildWorkflowPreviewAddText(rule: WorkflowCommonRule): string {
    const lines = [
        ...buildRuleSummaryLines(rule as unknown as Record<string, unknown>),
    ];

    if (rule.steps.length > 0) {
        lines.push('', '步骤预览：');
        for (const [index, step] of rule.steps.entries()) {
            lines.push(`- 步骤${index + 1}：${summarizeWorkflowStepForDiff(step)}`);
        }
    }

    return buildPreviewText('规则预览添加', 'workflow', lines);
}

function buildUpdateSuccessText(category: RulePluginCategory, name: string, changedFields: string[], clearedCount: number): string {
    return [
        '插件已修改成功',
        `- 分类：${category}`,
        `- 名称：${name}`,
        `- 变更字段：${formatChangedFields(changedFields)}`,
        '',
        `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function summarizeWorkflowStepForDiff(step: Record<string, unknown> | WorkflowCommonRule['steps'][number]): string {
    const name = normalizeOptionalString(step.name) ?? '（未命名）';
    const mode = normalizeOptionalString(step.mode) ?? '（空）';
    const enabled = step.enabled === false ? '禁用' : '启用';
    const saveAs = normalizeOptionalString(step.saveAs);
    const url = normalizeOptionalString(step.url) ?? '';
    return [
        name,
        mode,
        enabled,
        saveAs ? `saveAs=${saveAs}` : undefined,
        url ? clipPreviewText(url, 50) : undefined,
    ].filter(Boolean).join(' | ');
}

type WorkflowStepDiffField = 'name' | 'enabled' | 'saveAs' | 'url' | 'mode' | 'jsonPath' | 'method';

function formatWorkflowStepDiffFieldValue(step: Record<string, unknown> | WorkflowCommonRule['steps'][number], field: WorkflowStepDiffField): string {
    switch (field) {
        case 'name':
            return normalizeOptionalString(step.name) ?? '（未命名）';
        case 'enabled':
            return step.enabled === false ? '否' : '是';
        case 'saveAs':
            return normalizeOptionalString(step.saveAs) ?? '（空）';
        case 'url':
            return clipPreviewText(normalizeOptionalString(step.url) ?? '（空）', 70);
        case 'mode':
            return normalizeOptionalString(step.mode) ?? '（空）';
        case 'jsonPath':
            return normalizeOptionalString(step.jsonPath) ?? '（空）';
        case 'method':
            return normalizeOptionalString(step.method) ?? 'GET';
        default:
            return '（空）';
    }
}

function buildWorkflowStepFieldDiffLines(
    previousStep: Record<string, unknown> | WorkflowCommonRule['steps'][number],
    nextStep: Record<string, unknown> | WorkflowCommonRule['steps'][number],
): string[] {
    const fieldDefs: Array<{field: WorkflowStepDiffField; label: string}> = [
        {field: 'name', label: '名称'},
        {field: 'enabled', label: '启用'},
        {field: 'saveAs', label: 'saveAs'},
        {field: 'url', label: '地址'},
        {field: 'mode', label: '模式'},
        {field: 'jsonPath', label: '提取'},
        {field: 'method', label: '请求'},
    ];

    const lines: string[] = [];
    for (const {field, label} of fieldDefs) {
        const previousValue = formatWorkflowStepDiffFieldValue(previousStep, field);
        const nextValue = formatWorkflowStepDiffFieldValue(nextStep, field);
        if (previousValue === nextValue) {
            continue;
        }
        lines.push(`  - ${label}：${previousValue} -> ${nextValue}`);
    }
    return lines;
}

function buildWorkflowStepDiffLines(
    previousSteps: WorkflowCommonRule['steps'],
    nextSteps: WorkflowCommonRule['steps'],
): string[] {
    const maxLength = Math.max(previousSteps.length, nextSteps.length);
    const lines: string[] = [];
    for (let index = 0; index < maxLength; index += 1) {
        const previousStep = previousSteps[index];
        const nextStep = nextSteps[index];
        if (JSON.stringify(previousStep) === JSON.stringify(nextStep)) {
            continue;
        }
        if (!previousStep && nextStep) {
            lines.push(`- 步骤${index + 1}：新增 ${summarizeWorkflowStepForDiff(nextStep)}`);
            continue;
        }
        if (previousStep && !nextStep) {
            lines.push(`- 步骤${index + 1}：删除 ${summarizeWorkflowStepForDiff(previousStep)}`);
            continue;
        }
        lines.push(`- 步骤${index + 1}：${summarizeWorkflowStepForDiff(previousStep!)} -> ${summarizeWorkflowStepForDiff(nextStep!)}`);
        lines.push(...buildWorkflowStepFieldDiffLines(previousStep!, nextStep!));
    }
    return lines;
}

function buildWorkflowPreviewUpdateText(
    name: string,
    previousRule: WorkflowCommonRule,
    nextRule: WorkflowCommonRule,
    changedFields: string[],
): string {
    const normalizedChangedFields = [...new Set(changedFields)];
    const lines = [
        `- 名称：${name}`,
        `- 变更字段：${formatChangedFields(normalizedChangedFields)}`,
    ];

    const previousOutputFrom = normalizeOptionalString(previousRule.outputFrom);
    const nextOutputFrom = normalizeOptionalString(nextRule.outputFrom);
    if (previousRule.steps.length !== nextRule.steps.length) {
        lines.push(`- 步骤数：${previousRule.steps.length} -> ${nextRule.steps.length}`);
    }
    if (previousOutputFrom !== nextOutputFrom) {
        lines.push(`- 输出来源：${previousOutputFrom ?? '（空）'} -> ${nextOutputFrom ?? '（空）'}`);
    }

    const stepDiffLines = buildWorkflowStepDiffLines(previousRule.steps, nextRule.steps);
    if (stepDiffLines.length > 0) {
        lines.push('', '步骤差异：', ...stepDiffLines);
    } else {
        lines.push('', '步骤差异：无实际变化');
    }

    return buildPreviewText('规则预览修改', 'workflow', lines);
}

function buildDeleteSuccessText(category: RulePluginCategory, name: string, clearedCount: number): string {
    return [
        '插件已删除',
        `- 分类：${category}`,
        `- 名称：${name}`,
        '',
        `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildCopySuccessText(category: RulePluginCategory, sourceName: string, targetName: string, clearedCount: number): string {
    return [
        '插件已复制成功',
        `- 分类：${category}`,
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        '',
        `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildRenameSuccessText(category: RulePluginCategory, sourceName: string, targetName: string, clearedCount: number): string {
    return [
        '插件已重命名成功',
        `- 分类：${category}`,
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        '',
        `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function summarizeRuleNames(names: string[], limit = 5): string {
    if (names.length === 0) return '无';
    const preview = names.slice(0, limit);
    const suffix = names.length > limit ? ` 等 ${names.length} 条` : '';
    return `${preview.join('、')}${suffix}`;
}

function buildRollbackSummaryLines(
    previousRules: Record<string, unknown>[],
    restoredRules: Record<string, unknown>[],
): string[] {
    const previousNames = previousRules
        .map((rule) => normalizeOptionalString(rule.name))
        .filter((value): value is string => Boolean(value));
    const restoredNames = restoredRules
        .map((rule) => normalizeOptionalString(rule.name))
        .filter((value): value is string => Boolean(value));

    const restoredOnly = restoredNames.filter((name) => !previousNames.includes(name));
    const removedOnly = previousNames.filter((name) => !restoredNames.includes(name));
    const samePayload = JSON.stringify(previousRules) === JSON.stringify(restoredRules);

    const lines = [
        `- 回滚前规则数：${previousRules.length}`,
        `- 回滚后规则数：${restoredRules.length}`,
        `- 恢复新增：${summarizeRuleNames(restoredOnly)}`,
        `- 回滚移除：${summarizeRuleNames(removedOnly)}`,
    ];

    if (samePayload) {
        lines.push('- 摘要：当前 live 与备份一致，本次回滚未产生名称级变化');
    } else if (restoredOnly.length === 0 && removedOnly.length === 0) {
        lines.push('- 摘要：规则名称集一致，但规则内容或顺序可能已恢复到备份版本');
    }

    return lines;
}

function buildRollbackSummaryText(
    category: RulePluginCategory,
    previousRules: Record<string, unknown>[],
    restoredRules: Record<string, unknown>[],
    clearedCount: number,
): string {
    const lines = [
        '已完成回滚',
        `- 分类：${category}`,
        ...buildRollbackSummaryLines(previousRules, restoredRules),
    ];

    lines.push('', `已写入 KV 并刷新缓存（清理 ${clearedCount} 项）。`);
    return lines.join('\n');
}

function buildRollbackPreviewText(
    category: RulePluginCategory,
    previousRules: Record<string, unknown>[],
    restoredRules: Record<string, unknown>[],
    warning?: string,
): string {
    return buildPreviewText('规则预览回滚', category, [
        ...buildRollbackSummaryLines(previousRules, restoredRules),
    ], warning, `插件管理 回滚 ${category}`);
}

export class PluginAdminService {
    async handleCommand(message: IncomingMessage, env: Env, command: PluginAdminCommand): Promise<TextReply> {
        ensureOwner(message, env);

        switch (command.action) {
            case 'help':
                return {type: 'text', content: buildHelpText()};
            case 'refresh':
                return {
                    type: 'text',
                    content: `规则缓存已刷新，清理 ${clearRemoteRulesCache()} 项。`,
                };
            case 'list':
                return {
                    type: 'text',
                    content: await this.listRules(env, command.category ?? 'common'),
                };
            case 'search':
                return {
                    type: 'text',
                    content: await this.searchRules(env, command.category, command.query),
                };
            case 'detail':
                return {
                    type: 'text',
                    content: await this.getRuleDetail(env, command.category, command.name, command.stepSelector),
                };
            case 'check':
                return {
                    type: 'text',
                    content: await this.checkRule(env, command.category, command.fields),
                };
            case 'preview-add':
                return {
                    type: 'text',
                    content: await this.previewAddWorkflowRule(env, command.fields),
                };
            case 'add':
                return {
                    type: 'text',
                    content: await this.addRule(env, command.category, command.fields),
                };
            case 'preview-update':
                return {
                    type: 'text',
                    content: await this.previewUpdateWorkflowRule(env, command.name, command.fields),
                };
            case 'update':
                return {
                    type: 'text',
                    content: await this.updateRule(env, command.category, command.name, command.fields),
                };
            case 'delete':
                return {
                    type: 'text',
                    content: command.confirmed
                        ? await this.deleteRule(env, command.category, command.name)
                        : await this.previewDeleteRule(env, command.category, command.name),
                };
            case 'preview-copy':
                return {
                    type: 'text',
                    content: await this.previewCopyRule(env, command.category, command.sourceName, command.targetName),
                };
            case 'copy':
                return {
                    type: 'text',
                    content: await this.copyRule(env, command.category, command.sourceName, command.targetName),
                };
            case 'preview-rename':
                return {
                    type: 'text',
                    content: await this.previewRenameRule(env, command.category, command.sourceName, command.targetName),
                };
            case 'rename':
                return {
                    type: 'text',
                    content: await this.renameRule(env, command.category, command.sourceName, command.targetName),
                };
            case 'preview-rollback':
                return {
                    type: 'text',
                    content: await this.previewRollbackRules(env, command.category),
                };
            case 'rollback':
                return {
                    type: 'text',
                    content: await this.rollbackRules(env, command.category),
                };
            default:
                return {type: 'text', content: buildHelpText()};
        }
    }

    async listRules(env: Env, category: RulePluginCategory): Promise<string> {
        ensureImplementedCategory(category);
        const rules = await readRawRules(env, category);
        return buildListText(category, rules, buildInlineOverrideWarning(env, category));
    }

    async searchRules(env: Env, category: RulePluginCategory, query: string): Promise<string> {
        ensureImplementedCategory(category);
        const rules = await readRawRules(env, category);
        return buildSearchText(category, rules, query, buildInlineOverrideWarning(env, category));
    }

    async getRuleDetail(env: Env, category: RulePluginCategory, name: string, stepSelector?: WorkflowStepSelectorInput): Promise<string> {
        ensureImplementedCategory(category);
        const targetName = normalizeRuleName(name);
        const rules = await readRawRules(env, category);
        const target = rules.find((rule) => normalizeOptionalString(rule.name) === targetName);
        if (!target) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }
        if (category === 'workflow' && stepSelector) {
            const normalizedSelector = normalizeWorkflowStepSelectorInput(stepSelector);
            if (!normalizedSelector) {
                throw new Error('查看步骤详情时必须提供步骤序号或步骤名称');
            }
            if (normalizedSelector.view === 'steps-json') {
                validateWorkflowRuleRecord(target);
                return buildWorkflowStepsJsonText(target, buildInlineOverrideWarning(env, category));
            }
            if (normalizedSelector.view === 'rule-json') {
                validateWorkflowRuleRecord(target);
                return buildWorkflowRuleJsonText(target, buildInlineOverrideWarning(env, category));
            }
            const normalizedRule = validateWorkflowRuleRecord(target);
            const stepIndex = resolveWorkflowStepSelectorIndex(normalizedRule.steps, normalizedSelector, '详情');
            if (stepIndex > normalizedRule.steps.length) {
                throw new Error(`步骤序号超出范围：当前共有 ${normalizedRule.steps.length} 个步骤，可查看范围 1-${normalizedRule.steps.length}`);
            }
            return buildWorkflowStepDetailText(normalizedRule, stepIndex, buildInlineOverrideWarning(env, category));
        }
        return buildDetailText(category, target, buildInlineOverrideWarning(env, category));
    }

    async checkRule(env: Env, category: RulePluginCategory, fields: CommonRuleInputPatch | DynamicRuleInputPatch | WorkflowRuleWritePatch): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowWritePatchSupported(category);
        const currentRules = await readRawRules(env, category);
        const previewRule = category === 'dynamic'
            ? this.buildDynamicPreviewRule(currentRules, fields as DynamicRuleInputPatch)
            : category === 'workflow'
                ? this.buildWorkflowPreviewRule(currentRules, fields as WorkflowRuleWritePatch)
                : this.buildCommonPreviewRule(currentRules, fields as CommonRuleInputPatch);
        return buildCheckSuccessText(category, previewRule);
    }

    async addRule(env: Env, category: RulePluginCategory, fields: CommonRuleInputPatch | DynamicRuleInputPatch | WorkflowRuleWritePatch): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowWritePatchSupported(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const nextRule = category === 'dynamic'
            ? this.buildDynamicPreviewRule(currentRules, fields as DynamicRuleInputPatch)
            : category === 'workflow'
                ? this.buildWorkflowPreviewRule(currentRules, fields as WorkflowRuleWritePatch)
                : this.buildCommonPreviewRule(currentRules, fields as CommonRuleInputPatch);

        const nextRules = [...currentRules, nextRule];
        validateRulesByCategory(category, nextRules);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRemoteRulesCache();
        return buildAddSuccessText(category, nextRule, clearedCount);
    }

    async previewAddWorkflowRule(env: Env, fields: WorkflowRuleWritePatch): Promise<string> {
        const category: RulePluginCategory = 'workflow';
        ensureImplementedCategory(category);
        ensureWorkflowWritePatchSupported(category);

        const currentRules = await readRawRules(env, category);
        const previewRule = this.buildWorkflowPreviewRule(currentRules, fields);
        return buildWorkflowPreviewAddText(validateWorkflowRuleRecord(previewRule));
    }

    async previewUpdateWorkflowRule(env: Env, name: string, fields: WorkflowRuleWritePatch): Promise<string> {
        const category: RulePluginCategory = 'workflow';
        ensureImplementedCategory(category);
        ensureWorkflowWritePatchSupported(category);

        const targetName = normalizeRuleName(name);
        const currentRules = await readRawRules(env, category);
        validateWorkflowRules(currentRules);

        const targetIndex = findRuleIndexByName(currentRules, targetName);
        if (targetIndex < 0) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }
        if (Object.keys(fields).length === 0) {
            throw new Error('预览修改命令至少需要提供一个字段');
        }

        const previousRule = validateWorkflowRuleRecord(currentRules[targetIndex]);
        const {nextRule, changedFields} = applyWorkflowRulePatch(currentRules[targetIndex], fields);
        const nextRules = currentRules.map((rule, index) => (index === targetIndex ? nextRule : rule));
        const normalizedRules = validateWorkflowRules(nextRules);
        const nextNormalizedRule = normalizedRules[targetIndex];
        return buildWorkflowPreviewUpdateText(targetName, previousRule, nextNormalizedRule, changedFields);
    }

    async updateRule(env: Env, category: RulePluginCategory, name: string, fields: CommonRuleInputPatch | DynamicRuleInputPatch | WorkflowRuleWritePatch): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowWritePatchSupported(category);
        ensureNoInlineOverrideForWrite(env, category);

        const targetName = normalizeRuleName(name);
        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);

        const targetIndex = findRuleIndexByName(currentRules, targetName);
        if (targetIndex < 0) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }

        if (Object.keys(fields).length === 0) {
            throw new Error('修改命令至少需要提供一个字段');
        }

        const {nextRule, changedFields} = category === 'dynamic'
            ? applyDynamicRulePatch(currentRules[targetIndex], fields as DynamicRuleInputPatch)
            : category === 'workflow'
                ? applyWorkflowRulePatch(currentRules[targetIndex], fields as WorkflowRuleWritePatch)
                : applyCommonRulePatch(currentRules[targetIndex], fields as CommonRuleInputPatch);
        const nextRules = currentRules.map((rule, index) => (index === targetIndex ? nextRule : rule));
        const normalizedRules = validateRulesByCategory(category, nextRules);
        const actualName = normalizedRules[targetIndex].name ?? targetName;

        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRemoteRulesCache();
        return buildUpdateSuccessText(category, actualName, changedFields, clearedCount);
    }

    async previewDeleteRule(env: Env, category: RulePluginCategory, name: string): Promise<string> {
        ensureImplementedCategory(category);

        const targetName = normalizeRuleName(name);
        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);

        const targetIndex = findRuleIndexByName(currentRules, targetName);
        if (targetIndex < 0) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }

        return buildDeletePreviewText(category, currentRules[targetIndex], buildInlineOverrideWarning(env, category));
    }

    async deleteRule(env: Env, category: RulePluginCategory, name: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureNoInlineOverrideForWrite(env, category);

        const targetName = normalizeRuleName(name);
        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);

        const targetIndex = findRuleIndexByName(currentRules, targetName);
        if (targetIndex < 0) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }

        const nextRules = currentRules.filter((_, index) => index !== targetIndex);
        validateRulesByCategory(category, nextRules);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRemoteRulesCache();
        return buildDeleteSuccessText(category, targetName, clearedCount);
    }

    async copyRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowRenameCopySupported(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRule} = this.prepareRuleCopy(currentRules, category, sourceName, targetNameInput);
        const nextRules = [...currentRules, nextRule];
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRemoteRulesCache();
        return buildCopySuccessText(category, normalizedSourceName, normalizedTargetName, clearedCount);
    }

    async previewCopyRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowRenameCopySupported(category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRule} = this.prepareRuleCopy(currentRules, category, sourceName, targetNameInput);
        return buildCopyPreviewText(category, normalizedSourceName, normalizedTargetName, nextRule, buildInlineOverrideWarning(env, category));
    }

    async previewRenameRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowRenameCopySupported(category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRules, sourceIndex} = this.prepareRuleRename(currentRules, category, sourceName, targetNameInput);
        return buildRenamePreviewText(category, normalizedSourceName, normalizedTargetName, nextRules[sourceIndex], buildInlineOverrideWarning(env, category));
    }

    async renameRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureWorkflowRenameCopySupported(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRules} = this.prepareRuleRename(currentRules, category, sourceName, targetNameInput);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRemoteRulesCache();
        return buildRenameSuccessText(category, normalizedSourceName, normalizedTargetName, clearedCount);
    }

    async rollbackRules(env: Env, category: RulePluginCategory): Promise<string> {
        ensureImplementedCategory(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);
        const backupRules = await readBackupRules(env, category);
        validateRulesByCategory(category, backupRules);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, backupRules);
        const clearedCount = clearRemoteRulesCache();
        return buildRollbackSummaryText(category, currentRules, backupRules, clearedCount);
    }

    async previewRollbackRules(env: Env, category: RulePluginCategory): Promise<string> {
        ensureImplementedCategory(category);

        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);
        const backupRules = await readBackupRules(env, category);
        validateRulesByCategory(category, backupRules);
        return buildRollbackPreviewText(category, currentRules, backupRules, buildInlineOverrideWarning(env, category));
    }

    private prepareRuleCopy(
        currentRules: Record<string, unknown>[],
        category: RulePluginCategory,
        sourceName: string,
        targetNameInput: string,
    ): {normalizedSourceName: string; normalizedTargetName: string; nextRule: Record<string, unknown>} {
        const normalizedSourceName = normalizeRuleName(sourceName);
        const normalizedTargetName = normalizeRuleName(targetNameInput);
        validateRulesByCategory(category, currentRules);

        const sourceRule = currentRules.find((rule) => normalizeOptionalString(rule.name) === normalizedSourceName);
        if (!sourceRule) {
            throw new Error(`未找到 ${category} 规则：${normalizedSourceName}`);
        }
        if (currentRules.some((rule) => normalizeOptionalString(rule.name) === normalizedTargetName)) {
            throw new Error(`规则名称已存在：${normalizedTargetName}`);
        }

        const nextRule = {...sourceRule, name: normalizedTargetName};
        validateRulesByCategory(category, [...currentRules, nextRule]);
        return {normalizedSourceName, normalizedTargetName, nextRule};
    }

    private prepareRuleRename(
        currentRules: Record<string, unknown>[],
        category: RulePluginCategory,
        sourceName: string,
        targetNameInput: string,
    ): {normalizedSourceName: string; normalizedTargetName: string; nextRules: Record<string, unknown>[]; sourceIndex: number} {
        const normalizedSourceName = normalizeRuleName(sourceName);
        const normalizedTargetName = normalizeRuleName(targetNameInput);
        validateRulesByCategory(category, currentRules);

        const sourceIndex = findRuleIndexByName(currentRules, normalizedSourceName);
        if (sourceIndex < 0) {
            throw new Error(`未找到 ${category} 规则：${normalizedSourceName}`);
        }
        if (normalizedSourceName !== normalizedTargetName && currentRules.some((rule) => normalizeOptionalString(rule.name) === normalizedTargetName)) {
            throw new Error(`规则名称已存在：${normalizedTargetName}`);
        }

        const nextRules = currentRules.map((rule, index) => index === sourceIndex ? {...rule, name: normalizedTargetName} : rule);
        validateRulesByCategory(category, nextRules);
        return {normalizedSourceName, normalizedTargetName, nextRules, sourceIndex};
    }

    private buildCommonPreviewRule(currentRules: Record<string, unknown>[], fields: CommonRuleInputPatch): Record<string, unknown> {
        validateCommonRules(currentRules);
        const patch = buildCommonRulePatch(fields, true);
        if (currentRules.some((rule) => normalizeOptionalString(rule.name) === patch.name)) {
            throw new Error(`规则名称已存在：${patch.name}`);
        }

        const previewRule: Record<string, unknown> = {
            name: patch.name,
            keyword: patch.keyword,
            url: patch.url,
            mode: patch.mode,
            rType: patch.rType,
        };
        if (patch.method) previewRule.method = patch.method;
        if (patch.jsonPath) previewRule.jsonPath = patch.jsonPath;
        applyAdvancedFieldsToRule(previewRule, fields);

        validateCommonRules([...currentRules, previewRule]);
        return previewRule;
    }

    private buildDynamicPreviewRule(currentRules: Record<string, unknown>[], fields: DynamicRuleInputPatch): Record<string, unknown> {
        validateDynamicRules(currentRules);
        const patch = buildDynamicRulePatch(fields, true);
        if (currentRules.some((rule) => normalizeOptionalString(rule.name) === patch.name)) {
            throw new Error(`规则名称已存在：${patch.name}`);
        }

        const previewRule: Record<string, unknown> = {
            name: patch.name,
            url: patch.url,
            mode: patch.mode,
            rType: patch.rType,
            matchMode: patch.matchMode ?? 'contains',
        };
        if (patch.keyword) previewRule.keyword = patch.keyword;
        if (patch.pattern) previewRule.pattern = patch.pattern;
        if (patch.method) previewRule.method = patch.method;
        if (patch.jsonPath) previewRule.jsonPath = patch.jsonPath;

        const args = buildDynamicArgsConfig(fields);
        if (args) previewRule.args = args;
        applyAdvancedFieldsToRule(previewRule, fields);

        validateDynamicRules([...currentRules, previewRule]);
        return previewRule;
    }

    private buildWorkflowPreviewRule(currentRules: Record<string, unknown>[], fields: WorkflowRuleWritePatch): Record<string, unknown> {
        validateWorkflowRules(currentRules);
        const patch = buildWorkflowRulePatch(fields, true);
        if (currentRules.some((rule) => normalizeOptionalString(rule.name) === patch.name)) {
            throw new Error(`规则名称已存在：${patch.name}`);
        }

        const previewRule: Record<string, unknown> = {
            name: patch.name,
            mode: 'workflow',
            rType: patch.rType,
            matchMode: patch.matchMode ?? 'contains',
            steps: patch.steps,
        };
        if (patch.keyword) previewRule.keyword = patch.keyword;
        if (patch.pattern) previewRule.pattern = patch.pattern;
        if (patch.outputFrom) previewRule.outputFrom = patch.outputFrom;

        const args = buildDynamicArgsConfig(fields);
        if (args) previewRule.args = args;
        applyAdvancedFieldsToRule(previewRule, fields);

        validateWorkflowRules([...currentRules, previewRule]);
        return previewRule;
    }
}
