import {
    KV_COMMON_BASE_RULES,
    KV_COMMON_BASE_RULES_BACKUP,
    KV_COMMON_DYNAMIC_RULES,
    KV_COMMON_DYNAMIC_RULES_BACKUP,
} from '../../../constants/kv.js';
import {clearRulesCache} from '../../rule-engine/rule-sources';
import {normalizeRuleConfigText, parseRuleConfigList} from '../../rule-engine/parser';
import type {SimpleRule} from '../../rule-engine/simple';
import type {DynamicRule} from '../../rule-engine/dynamic';
import {normalizeKeyword as normalizeMatchKeywords} from '../../rule-engine/matcher';
import type {ArgsConfig, ArgsMode, MatchMode} from '../../rule-engine/matcher';
import type {RuleRequestConfig} from '../../rule-engine/model.js';
import {RuleDefinitionRepository} from '../../rule-engine/repository.js';
import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {TextReply} from '../../../types/reply.js';
import {NO_PERMISSION_REPLY} from '../../../constants/messages.js';
import type {
    CommonRuleInputPatch,
    DynamicRuleInputPatch,
    PluginAdminCategoryMeta,
    PluginAdminCommand,
    RulePluginCategory,
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

const CATEGORY_META_MAP: Record<RulePluginCategory, PluginAdminCategoryMeta> = {
    common: {
        category: 'common',
        liveKey: KV_COMMON_BASE_RULES,
        backupKey: KV_COMMON_BASE_RULES_BACKUP,
        displayName: 'common 规则',
    },
    dynamic: {
        category: 'dynamic',
        liveKey: KV_COMMON_DYNAMIC_RULES,
        backupKey: KV_COMMON_DYNAMIC_RULES_BACKUP,
        displayName: 'dynamic 规则',
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

function normalizeMode(value: unknown): SimpleRule['mode'] {
    const mode = normalizeNonEmptyString(value, '模式').toLowerCase();
    if (!SUPPORTED_COMMON_MODES.has(mode as SimpleRule['mode'])) {
        throw new Error('模式仅支持 text/json/base64');
    }
    return mode as SimpleRule['mode'];
}

function normalizeReplyType(value: unknown): SimpleRule['rType'] {
    const replyType = normalizeNonEmptyString(value, '回复').toLowerCase();
    if (!SUPPORTED_COMMON_REPLY_TYPES.has(replyType as SimpleRule['rType'])) {
        throw new Error('回复仅支持 text/image/video/voice/link/card/app');
    }
    return replyType as SimpleRule['rType'];
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

function normalizeOptionalJsonObject(value: unknown, fieldLabel: string): Record<string, unknown> | undefined {
    if (value == null) return undefined;
    const parsed = normalizeJsonValue(value, fieldLabel);
    if (!parsed) return undefined;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
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

function buildRequestConfigValue(rawRule: Record<string, unknown>): RuleRequestConfig | undefined {
    const requestConfig = normalizeOptionalJsonObject(rawRule.requestConfig, '请求配置') ?? {};
    const headers = normalizeHeadersValue(rawRule.headers);
    const hasBody = hasOwn(rawRule, 'body');
    if (headers) requestConfig.headers = headers;
    if (hasBody) requestConfig.body = normalizeJsonValue(rawRule.body, '请求体');
    return Object.keys(requestConfig).length ? requestConfig : undefined;
}

function buildReplyPayloadValue(rawRule: Record<string, unknown>): Record<string, unknown> | undefined {
    const replyPayload = normalizeOptionalJsonObject(rawRule.replyPayload, '回复配置') ?? {};

    const linkTitle = normalizeOptionalString(rawRule.linkTitle);
    if (linkTitle) replyPayload.title = linkTitle;
    const linkDescription = normalizeOptionalString(rawRule.linkDescription);
    if (linkDescription) replyPayload.description = linkDescription;
    const linkPicUrl = normalizeOptionalHttpUrl(rawRule.linkPicUrl, '链接图片');
    if (linkPicUrl) replyPayload.picUrl = linkPicUrl;
    const voiceFormat = normalizeOptionalInteger(rawRule.voiceFormat, '语音格式');
    if (voiceFormat !== undefined) replyPayload.format = voiceFormat;
    const voiceDurationMs = normalizeOptionalInteger(rawRule.voiceDurationMs, '语音时长');
    if (voiceDurationMs !== undefined) replyPayload.durationMs = voiceDurationMs;
    const voiceFallbackText = normalizeOptionalString(rawRule.voiceFallbackText);
    if (voiceFallbackText) replyPayload.fallbackText = voiceFallbackText;
    const cardUsername = normalizeOptionalString(rawRule.cardUsername);
    if (cardUsername) replyPayload.username = cardUsername;
    const cardNickname = normalizeOptionalString(rawRule.cardNickname);
    if (cardNickname) replyPayload.nickname = cardNickname;
    const cardAlias = normalizeOptionalString(rawRule.cardAlias);
    if (cardAlias) replyPayload.alias = cardAlias;
    const appType = normalizeOptionalInteger(rawRule.appType, 'app类型');
    if (appType !== undefined) replyPayload.appType = appType;
    const appXml = normalizeOptionalString(rawRule.appXml);
    if (appXml) replyPayload.appXml = appXml;

    return Object.keys(replyPayload).length ? replyPayload : undefined;
}

function validateReplySpecificFields(rule: {
    rType: SimpleRule['rType'];
    linkPicUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    cardUsername?: string;
    cardNickname?: string;
    appXml?: string;
    appType?: number;
    jsonPath?: string;
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
        // 静态 appXml，或运行时由 jsonPath 拼出 XML（如点歌）均可
        if (!rule.appXml?.trim() && !rule.jsonPath?.trim()) {
            throw new Error('app 回复至少需要 appXml，或通过提取(jsonPath)在运行时生成');
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
    const description = normalizeOptionalString(rule.description);
    return description
        ? `${index + 1}. ${name} - ${matcherPreview(rule)} - ${clipPreviewText(description, 40)}`
        : `${index + 1}. ${name} - ${matcherPreview(rule)}`;
}

function buildHelpSection(title: string, lines: string[]): string[] {
    return [title, ...lines, ''];
}

function buildHelpQuerySectionLines(): string[] {
    return buildHelpSection('一、查询命令', [
        '- 插件管理 帮助',
        '- 插件管理 列表 [common|dynamic]',
        '- 插件管理 搜索 <分类> <关键字>',
        '- 插件管理 详情 common <名称>',
        '- 插件管理 详情 dynamic <名称>',
        '- 插件管理 检查 <分类>',
        '- 插件管理 刷新',
    ]);
}

function buildHelpPreviewSectionLines(): string[] {
    return buildHelpSection('二、只读预览命令', [
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
        '  描述：这是干啥的',
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
        '  请求配置：<<<',
        '  {"timeoutMs":5000}',
        '  >>>',
        '  回复配置：<<<',
        '  {"template":"结果：{{result}}"}',
        '  >>>',
        '',
        '- 插件管理 添加 dynamic',
        '  名称：weather-regex',
        '  描述：天气查询',
        '  正则：^天气\\s+(.+)$',
        '  匹配模式：regex',
        '  参数模式：regex',
        '  参数名：query',
        '  地址：https://example.com/weather?q={{query}}',
        '  模式：json',
        '  提取：$.data.text',
        '  回复：text',
        '',
    ]);
}

function buildHelpWorkflowEditExampleLines(): string[] {
    return buildHelpSection('五、说明', [
        'workflow 已移除，不再提供新增、修改、查询或运行支持。',
        '后续需要多步逻辑时，建议直接拆成独立插件实现。',
    ]);
}

function buildHelpFieldNotesLines(): string[] {
    return [
        '六、字段与格式说明',
        '所有分类都支持字段：名称、描述',
        'common / dynamic 额外支持字段：请求头、请求体、请求配置、回复配置、链接标题、链接描述、链接图片、语音格式、语音时长、语音降级文案、卡片用户名、卡片昵称、卡片别名、app类型、appXml',
        'dynamic 额外支持字段：正则、匹配模式、参数模式、参数分隔符、参数名、必填参数',
        'workflow 已移除，不再兼容旧命令入口。',
        '多行值可使用：字段：<<<  ...  >>>',
    ];
}

function buildHelpText(): string {
    return [
        '插件管理（当前仅支持 common / dynamic）',
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
        throw new Error('插件管理功能还没找到主人，暂时不能使用哦');
    }
    if (!isOwner(message, env)) {
        throw new Error(NO_PERMISSION_REPLY);
    }
}

function ensureImplementedCategory(category: RulePluginCategory): void {
    void category;
}

function getCategoryMeta(category: RulePluginCategory): PluginAdminCategoryMeta {
    return CATEGORY_META_MAP[category];
}

function buildCategoryWarning(env: Env, category: RulePluginCategory): string | undefined {
    const warnings: string[] = [];
    if (category === 'common') {
        const hasInline = Boolean(env.COMMON_PLUGINS_CONFIG?.trim() || env.COMMON_PLUGINS_MAPPING?.trim());
        if (hasInline) {
            warnings.push('警告：当前 common 规则由环境变量内联配置接管，下面展示的是存储里的内容，不是实际生效规则。');
        }
    }
    return warnings.length ? warnings.join('\n') : undefined;
}

function ensureNoInlineOverrideForWrite(env: Env, category: RulePluginCategory): void {
    if (category !== 'common') return;
    if (env.COMMON_PLUGINS_CONFIG?.trim() || env.COMMON_PLUGINS_MAPPING?.trim()) {
        throw new Error([
            '当前 common 规则由环境变量内联配置接管，聊天命令修改存储不会生效。',
            '请先切换到 KV 管理模式，再执行插件管理命令。',
        ].join('\n'));
    }
}

function parseRuleArray(rawText: string | null, keyName: string): Record<string, unknown>[] {
    const normalizedText = normalizeRuleConfigText(rawText ?? undefined);
    if (!normalizedText) return [];

    let parsed: unknown;
    try {
        parsed = parseRuleConfigList(normalizedText);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === '配置不是数组/keywordMapping') {
            throw new Error(`${keyName} 中保存的规则不是数组/keywordMapping，无法继续管理`);
        }
        throw new Error(`${keyName} 中保存的规则不是合法 JSON，无法继续管理`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`${keyName} 中保存的规则不是数组/keywordMapping，无法继续管理`);
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

    if (hasOwn(fields, 'description')) {
        patch.description = normalizeOptionalString(fields.description);
    }
    if (hasOwn(fields, 'requestConfig')) {
        patch.requestConfig = normalizeOptionalString(fields.requestConfig);
    }
    if (hasOwn(fields, 'replyPayload')) {
        patch.replyPayload = normalizeOptionalString(fields.replyPayload);
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

    if (hasOwn(fields, 'description')) {
        patch.description = normalizeOptionalString(fields.description);
    }
    if (hasOwn(fields, 'requestConfig')) {
        patch.requestConfig = normalizeOptionalString(fields.requestConfig);
    }
    if (hasOwn(fields, 'replyPayload')) {
        patch.replyPayload = normalizeOptionalString(fields.replyPayload);
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

function applyAdvancedFieldsToRule(
    nextRule: Record<string, unknown>,
    fields: CommonRuleInputPatch | DynamicRuleInputPatch,
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
    if (hasOwn(fields, 'requestConfig')) {
        const requestConfig = normalizeOptionalJsonObject(fields.requestConfig, '请求配置');
        if (requestConfig) {
            nextRule.requestConfig = requestConfig;
        } else if (hasOwn(nextRule, 'requestConfig')) {
            delete nextRule.requestConfig;
        }
        changedFields?.push('请求配置');
    }
    if (hasOwn(fields, 'replyPayload')) {
        const replyPayload = normalizeOptionalJsonObject(fields.replyPayload, '回复配置');
        if (replyPayload) {
            nextRule.replyPayload = replyPayload;
        } else if (hasOwn(nextRule, 'replyPayload')) {
            delete nextRule.replyPayload;
        }
        changedFields?.push('回复配置');
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
    if (hasOwn(fields, 'description')) {
        if (normalized.description) {
            if (normalized.description !== target.description) {
                nextRule.description = normalized.description;
                changedFields.push('描述');
            }
        } else if (hasOwn(nextRule, 'description')) {
            delete nextRule.description;
            changedFields.push('描述');
        }
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
    if (hasOwn(fields, 'description')) {
        if (normalized.description) {
            if (normalized.description !== target.description) {
                nextRule.description = normalized.description;
                changedFields.push('描述');
            }
        } else if (hasOwn(nextRule, 'description')) {
            delete nextRule.description;
            changedFields.push('描述');
        }
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

function validateCommonRuleRecord(rawRule: Record<string, unknown>): SimpleRule {
    const name = normalizeRuleName(rawRule.name);
    const description = normalizeOptionalString(rawRule.description);
    const keyword = normalizeKeyword(rawRule.keyword);
    const url = normalizeHttpUrl(rawRule.url);
    const mode = normalizeMode(rawRule.mode);
    const rType = normalizeReplyType(rawRule.rType);
    const methodText = normalizeOptionalString(rawRule.method);
    const jsonPath = normalizeOptionalString(rawRule.jsonPath);

    const normalizedRule = {
        name,
        description,
        keyword,
        url,
        mode,
        rType,
        method: methodText ? normalizeMethod(methodText) : undefined,
        jsonPath,
        headers: normalizeHeadersValue(rawRule.headers),
        body: normalizeJsonValue(rawRule.body, '请求体'),
        requestConfig: buildRequestConfigValue(rawRule),
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
        replyPayload: buildReplyPayloadValue(rawRule),
    } satisfies SimpleRule;

    validateReplySpecificFields(normalizedRule);
    return normalizedRule;
}

function validateDynamicRuleRecord(rawRule: Record<string, unknown>): DynamicRule {
    const name = normalizeRuleName(rawRule.name);
    const description = normalizeOptionalString(rawRule.description);
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
        description,
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
        requestConfig: buildRequestConfigValue(rawRule),
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
        replyPayload: buildReplyPayloadValue(rawRule),
    } satisfies DynamicRule;

    validateReplySpecificFields(normalizedRule);
    return normalizedRule;
}

function validateCommonRules(rawRules: Record<string, unknown>[]): SimpleRule[] {
    const seenNames = new Set<string>();
    return rawRules.map((rawRule, index) => {
        let normalized: SimpleRule;
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

function validateDynamicRules(rawRules: Record<string, unknown>[]): DynamicRule[] {
    const seenNames = new Set<string>();
    return rawRules.map((rawRule, index) => {
        let normalized: DynamicRule;
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

function validateRulesByCategory(category: RulePluginCategory, rawRules: Record<string, unknown>[]): Array<SimpleRule | DynamicRule> {
    if (category === 'dynamic') return validateDynamicRules(rawRules);
    return validateCommonRules(rawRules);
}

function clearRuleCaches(): number {
    return clearRulesCache() + RuleDefinitionRepository.clearCache();
}

async function readRawRules(env: Env, category: RulePluginCategory): Promise<Record<string, unknown>[]> {
    if (category === 'common' || category === 'dynamic') {
        const rules = await RuleDefinitionRepository.listLegacyRulesByCategory(env, category);
        if (rules) return rules;
    }
    const meta = getCategoryMeta(category);
    const raw = await env.XBOT_KV.get(meta.liveKey);
    return parseRuleArray(raw, meta.liveKey);
}

async function writeRawRules(env: Env, category: RulePluginCategory, rawRules: Record<string, unknown>[]): Promise<void> {
    const meta = getCategoryMeta(category);
    if (category === 'common' || category === 'dynamic') {
        await RuleDefinitionRepository.replaceCategoryFromLegacyRawRules(env, category, rawRules);
    }
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
        return `${formatWarningPrefix(warning)}当前 ${category} 分类还没有任何规则。`;
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
        const description = normalizeOptionalString(rule.description)?.toLowerCase() ?? '';
        const matcher = matcherPreview(rule).toLowerCase();
        return name.includes(normalizedQuery)
            || description.includes(normalizedQuery)
            || matcher.includes(normalizedQuery);
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
        `- 描述：${normalizeOptionalString(rule.description) ?? '（空）'}`,
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

    const hasRequestInfo = Boolean(normalizeOptionalString(rule.url) || method || jsonPath || rule.headers || hasOwn(rule, 'body') || rule.requestConfig);
    if (hasRequestInfo) {
        lines.push('', '请求信息');
        if (normalizeOptionalString(rule.url)) lines.push(`- 地址：${normalizeOptionalString(rule.url)}`);
        if (method) lines.push(`- 请求：${method}`);
        if (jsonPath) lines.push(`- 提取：${jsonPath}`);
        if (rule.headers) pushDetailValueBlock(lines, '请求头', rule.headers);
        if (hasOwn(rule, 'body')) pushDetailValueBlock(lines, '请求体', rule.body);
        if (rule.requestConfig) pushDetailValueBlock(lines, '请求配置', rule.requestConfig);
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
        || rule.replyPayload
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
        if (rule.replyPayload) pushDetailValueBlock(lines, '回复配置', rule.replyPayload);
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

function buildRuleSummaryLines(rule: Record<string, unknown>): string[] {
    const lines = [
        `- 名称：${normalizeOptionalString(rule.name) ?? ''}`,
        `- 描述：${normalizeOptionalString(rule.description) ?? '（空）'}`,
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
        '本次仅校验，还没保存。',
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
        '本次仅预览，还没保存。',
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
        `已保存并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildUpdateSuccessText(category: RulePluginCategory, name: string, changedFields: string[], clearedCount: number): string {
    return [
        '插件已修改成功',
        `- 分类：${category}`,
        `- 名称：${name}`,
        `- 变更字段：${formatChangedFields(changedFields)}`,
        '',
        `已保存并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function summarizeWorkflowStepForDiff(step: Record<string, unknown>): string {
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

function buildDeleteSuccessText(category: RulePluginCategory, name: string, clearedCount: number): string {
    return [
        '插件已删除',
        `- 分类：${category}`,
        `- 名称：${name}`,
        '',
        `已保存并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildCopySuccessText(category: RulePluginCategory, sourceName: string, targetName: string, clearedCount: number): string {
    return [
        '插件已复制成功',
        `- 分类：${category}`,
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        '',
        `已保存并刷新缓存（清理 ${clearedCount} 项）。`,
    ].join('\n');
}

function buildRenameSuccessText(category: RulePluginCategory, sourceName: string, targetName: string, clearedCount: number): string {
    return [
        '插件已重命名成功',
        `- 分类：${category}`,
        `- 原名称：${sourceName}`,
        `- 新名称：${targetName}`,
        '',
        `已保存并刷新缓存（清理 ${clearedCount} 项）。`,
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

    lines.push('', `已保存并刷新缓存（清理 ${clearedCount} 项）。`);
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
                    content: `规则缓存已刷新，清理 ${clearRuleCaches()} 项。`,
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
                    content: await this.getRuleDetail(env, command.category, command.name),
                };
            case 'check':
                return {
                    type: 'text',
                    content: await this.checkRule(env, command.category, command.fields),
                };
            case 'add':
                return {
                    type: 'text',
                    content: await this.addRule(env, command.category, command.fields),
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
        return buildListText(category, rules, buildCategoryWarning(env, category));
    }

    async searchRules(env: Env, category: RulePluginCategory, query: string): Promise<string> {
        ensureImplementedCategory(category);
        const rules = await readRawRules(env, category);
        return buildSearchText(category, rules, query, buildCategoryWarning(env, category));
    }

    async getRuleDetail(env: Env, category: RulePluginCategory, name: string): Promise<string> {
        ensureImplementedCategory(category);
        const targetName = normalizeRuleName(name);
        const rules = await readRawRules(env, category);
        const target = rules.find((rule) => normalizeOptionalString(rule.name) === targetName);
        if (!target) {
            throw new Error(`未找到 ${category} 规则：${targetName}`);
        }
        return buildDetailText(category, target, buildCategoryWarning(env, category));
    }

    async checkRule(env: Env, category: RulePluginCategory, fields: CommonRuleInputPatch | DynamicRuleInputPatch): Promise<string> {
        ensureImplementedCategory(category);
        const currentRules = await readRawRules(env, category);
        const previewRule = category === 'dynamic'
            ? this.buildDynamicPreviewRule(currentRules, fields as DynamicRuleInputPatch)
            : this.buildCommonPreviewRule(currentRules, fields as CommonRuleInputPatch);
        return buildCheckSuccessText(category, previewRule);
    }

    async addRule(env: Env, category: RulePluginCategory, fields: CommonRuleInputPatch | DynamicRuleInputPatch): Promise<string> {
        ensureImplementedCategory(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const nextRule = category === 'dynamic'
            ? this.buildDynamicPreviewRule(currentRules, fields as DynamicRuleInputPatch)
            : this.buildCommonPreviewRule(currentRules, fields as CommonRuleInputPatch);

        const nextRules = [...currentRules, nextRule];
        validateRulesByCategory(category, nextRules);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRuleCaches();
        return buildAddSuccessText(category, nextRule, clearedCount);
    }

    async updateRule(env: Env, category: RulePluginCategory, name: string, fields: CommonRuleInputPatch | DynamicRuleInputPatch): Promise<string> {
        ensureImplementedCategory(category);
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
            : applyCommonRulePatch(currentRules[targetIndex], fields as CommonRuleInputPatch);
        const nextRules = currentRules.map((rule, index) => (index === targetIndex ? nextRule : rule));
        const normalizedRules = validateRulesByCategory(category, nextRules);
        const actualName = normalizedRules[targetIndex].name ?? targetName;

        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRuleCaches();
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

        return buildDeletePreviewText(category, currentRules[targetIndex], buildCategoryWarning(env, category));
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
        const clearedCount = clearRuleCaches();
        return buildDeleteSuccessText(category, targetName, clearedCount);
    }

    async copyRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRule} = this.prepareRuleCopy(currentRules, category, sourceName, targetNameInput);
        const nextRules = [...currentRules, nextRule];
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRuleCaches();
        return buildCopySuccessText(category, normalizedSourceName, normalizedTargetName, clearedCount);
    }

    async previewCopyRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRule} = this.prepareRuleCopy(currentRules, category, sourceName, targetNameInput);
        return buildCopyPreviewText(category, normalizedSourceName, normalizedTargetName, nextRule, buildCategoryWarning(env, category));
    }

    async previewRenameRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRules, sourceIndex} = this.prepareRuleRename(currentRules, category, sourceName, targetNameInput);
        return buildRenamePreviewText(category, normalizedSourceName, normalizedTargetName, nextRules[sourceIndex], buildCategoryWarning(env, category));
    }

    async renameRule(env: Env, category: RulePluginCategory, sourceName: string, targetNameInput: string): Promise<string> {
        ensureImplementedCategory(category);
        ensureNoInlineOverrideForWrite(env, category);

        const currentRules = await readRawRules(env, category);
        const {normalizedSourceName, normalizedTargetName, nextRules} = this.prepareRuleRename(currentRules, category, sourceName, targetNameInput);
        await backupRawRules(env, category, currentRules);
        await writeRawRules(env, category, nextRules);
        const clearedCount = clearRuleCaches();
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
        const clearedCount = clearRuleCaches();
        return buildRollbackSummaryText(category, currentRules, backupRules, clearedCount);
    }

    async previewRollbackRules(env: Env, category: RulePluginCategory): Promise<string> {
        ensureImplementedCategory(category);

        const currentRules = await readRawRules(env, category);
        validateRulesByCategory(category, currentRules);
        const backupRules = await readBackupRules(env, category);
        validateRulesByCategory(category, backupRules);
        return buildRollbackPreviewText(category, currentRules, backupRules, buildCategoryWarning(env, category));
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
            ...(patch.description ? {description: patch.description} : {}),
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
            ...(patch.description ? {description: patch.description} : {}),
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
}
