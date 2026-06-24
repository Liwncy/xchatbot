function normalizeOptionalString(value) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeOptionalNumber(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.floor(numeric);
}

function normalizeKeyword(keyword) {
    if (!keyword) return [];
    const rawItems = Array.isArray(keyword) ? keyword : [keyword];
    return rawItems
        .flatMap((item) => String(item).split('|'))
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeKeywordValue(value) {
    if (typeof value === 'string') {
        const keywords = normalizeKeyword(value);
        if (!keywords.length) return undefined;
        return keywords.length === 1 ? keywords[0] : keywords;
    }
    if (Array.isArray(value)) {
        const keywords = value
            .map((item) => (typeof item === 'string' ? item : ''))
            .flatMap((item) => item.split('|'))
            .map((item) => item.trim())
            .filter(Boolean);
        if (!keywords.length) return undefined;
        return keywords.length === 1 ? keywords[0] : keywords;
    }
    return undefined;
}

function serializeKeyword(keyword) {
    if (!keyword) return undefined;
    if (Array.isArray(keyword)) {
        const items = keyword.map((item) => item.trim()).filter(Boolean);
        return items.length ? items.join('|') : undefined;
    }
    const trimmed = keyword.trim();
    return trimmed || undefined;
}

function normalizeMatchMode(mode) {
    const normalized = (mode ?? '').trim().toLowerCase();
    if (normalized === 'contains' || normalized === 'prefix' || normalized === 'exact' || normalized === 'regex') {
        return normalized;
    }
    return 'contains';
}

function normalizeRuleRequestMethod(value) {
    const normalized = (value ?? '').trim().toUpperCase();
    if (normalized === 'GET' || normalized === 'POST') return normalized;
    return undefined;
}

function normalizeRuleRequestMode(value) {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'text' || normalized === 'json' || normalized === 'base64') return normalized;
    if (normalized === 'base') return 'base64';
    return undefined;
}

function normalizeRuleReplyType(value) {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'text'
        || normalized === 'image'
        || normalized === 'video'
        || normalized === 'voice'
        || normalized === 'link'
        || normalized === 'card'
        || normalized === 'app') {
        return normalized;
    }
    return undefined;
}

function normalizeHeaders(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const headers = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') continue;
        headers[key] = entry;
    }
    return Object.keys(headers).length ? headers : undefined;
}

function normalizeOptionalJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return {...value};
}

function normalizeArgs(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const mode = normalizeOptionalString(value.mode);
    const delimiter = normalizeOptionalString(value.delimiter);
    const names = Array.isArray(value.names)
        ? value.names.map((item) => normalizeOptionalString(item)).filter(Boolean)
        : undefined;
    const required = Array.isArray(value.required)
        ? value.required.map((item) => normalizeOptionalString(item)).filter(Boolean)
        : undefined;
    if (!mode && !delimiter && !names?.length && !required?.length) return undefined;
    return {
        ...(mode ? {mode} : {}),
        ...(delimiter ? {delimiter} : {}),
        ...(names?.length ? {names} : {}),
        ...(required?.length ? {required} : {}),
    };
}

function normalizeReplyPayload(rawRule) {
    const payload = {
        ...(normalizeOptionalJsonObject(rawRule.replyPayload) ?? {}),
    };
    if (typeof rawRule.linkTitle === 'string' && rawRule.linkTitle.trim()) payload.title = rawRule.linkTitle.trim();
    if (typeof rawRule.linkDescription === 'string' && rawRule.linkDescription.trim()) payload.description = rawRule.linkDescription.trim();
    if (typeof rawRule.linkPicUrl === 'string' && rawRule.linkPicUrl.trim()) payload.picUrl = rawRule.linkPicUrl.trim();
    const voiceFormat = normalizeOptionalNumber(rawRule.voiceFormat);
    if (voiceFormat !== undefined) payload.format = voiceFormat;
    const voiceDurationMs = normalizeOptionalNumber(rawRule.voiceDurationMs);
    if (voiceDurationMs !== undefined) payload.durationMs = voiceDurationMs;
    if (typeof rawRule.voiceFallbackText === 'string' && rawRule.voiceFallbackText.trim()) payload.fallbackText = rawRule.voiceFallbackText.trim();
    if (typeof rawRule.cardUsername === 'string' && rawRule.cardUsername.trim()) payload.username = rawRule.cardUsername.trim();
    if (typeof rawRule.cardNickname === 'string' && rawRule.cardNickname.trim()) payload.nickname = rawRule.cardNickname.trim();
    if (typeof rawRule.cardAlias === 'string' && rawRule.cardAlias.trim()) payload.alias = rawRule.cardAlias.trim();
    const appType = normalizeOptionalNumber(rawRule.appType);
    if (appType !== undefined) payload.appType = appType;
    if (typeof rawRule.appXml === 'string' && rawRule.appXml.trim()) payload.appXml = rawRule.appXml.trim();
    return Object.keys(payload).length ? payload : undefined;
}

function buildRequestConfig(rawRule) {
    const headers = normalizeHeaders(rawRule.headers);
    const hasBody = Object.prototype.hasOwnProperty.call(rawRule, 'body');
    const requestConfig = {
        ...(normalizeOptionalJsonObject(rawRule.requestConfig) ?? {}),
        ...(headers ? {headers} : {}),
        ...(hasBody ? {body: rawRule.body} : {}),
    };
    return Object.keys(requestConfig).length ? requestConfig : undefined;
}

function parseRuleConfigList(raw) {
    const source = (raw ?? '').replace(/^\uFEFF/u, '').trim();
    if (!source) return [];
    const parsed = JSON.parse(source);
    const list = Array.isArray(parsed) ? parsed : parsed?.keywordMapping;
    if (!Array.isArray(list)) {
        throw new Error('配置不是数组/keywordMapping');
    }
    return list;
}

function commonRawToDefinition(rawRule) {
    const name = normalizeOptionalString(rawRule.name);
    const keyword = normalizeKeywordValue(rawRule.keyword);
    const requestUrl = normalizeOptionalString(rawRule.url);
    const responseMode = normalizeRuleRequestMode(normalizeOptionalString(rawRule.mode));
    const replyType = normalizeRuleReplyType(normalizeOptionalString(rawRule.rType) ?? normalizeOptionalString(rawRule.fileType));
    if (!name || !keyword || !requestUrl || !responseMode || !replyType) return null;

    const now = Date.now();
    return {
        id: `common:${name.trim()}`,
        name,
        description: normalizeOptionalString(rawRule.description),
        enabled: true,
        priority: 0,
        matchType: 'contains',
        triggerText: serializeKeyword(keyword),
        sourceType: 'http',
        requestMethod: normalizeRuleRequestMethod(normalizeOptionalString(rawRule.method)) ?? 'GET',
        requestUrl,
        responseMode,
        responsePath: normalizeOptionalString(rawRule.jsonPath),
        requestConfig: buildRequestConfig(rawRule),
        replyType,
        replyPayload: normalizeReplyPayload(rawRule),
        createdAt: now,
        updatedAt: now,
    };
}

function dynamicRawToDefinition(rawRule) {
    const name = normalizeOptionalString(rawRule.name);
    const requestUrl = normalizeOptionalString(rawRule.url);
    const responseMode = normalizeRuleRequestMode(normalizeOptionalString(rawRule.mode));
    const replyType = normalizeRuleReplyType(normalizeOptionalString(rawRule.rType) ?? normalizeOptionalString(rawRule.fileType));
    if (!name || !requestUrl || !responseMode || !replyType) return null;

    const matchType = normalizeMatchMode(normalizeOptionalString(rawRule.matchMode));
    const keyword = normalizeKeywordValue(rawRule.keyword);
    const pattern = normalizeOptionalString(rawRule.pattern);
    if (matchType === 'regex' && !pattern) return null;
    if (matchType !== 'regex' && !keyword) return null;

    const now = Date.now();
    return {
        id: `dynamic:${name.trim()}`,
        name,
        description: normalizeOptionalString(rawRule.description),
        enabled: true,
        priority: 0,
        matchType,
        triggerText: serializeKeyword(keyword),
        pattern,
        args: normalizeArgs(rawRule.args),
        sourceType: 'http',
        requestMethod: normalizeRuleRequestMethod(normalizeOptionalString(rawRule.method)) ?? 'GET',
        requestUrl,
        responseMode,
        responsePath: normalizeOptionalString(rawRule.jsonPath),
        requestConfig: buildRequestConfig(rawRule),
        replyType,
        replyPayload: normalizeReplyPayload(rawRule),
        createdAt: now,
        updatedAt: now,
    };
}

function parseLegacyRuleArray(rawText, mapper) {
    if (!rawText?.trim()) return [];
    const list = parseRuleConfigList(rawText);
    return list
        .filter((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
        .map((item) => mapper(item))
        .filter(Boolean);
}

function convertKvRulesToDefinitions(commonRaw, dynamicRaw) {
    const common = parseLegacyRuleArray(commonRaw, commonRawToDefinition);
    const dynamic = parseLegacyRuleArray(dynamicRaw, dynamicRawToDefinition);
    return {common, dynamic, all: [...common, ...dynamic]};
}

function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
}

function serializeJson(value) {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
}

function buildInsertSql(definition) {
    const columns = [
        'id', 'name', 'description', 'enabled', 'priority',
        'match_type', 'trigger_text', 'pattern', 'args_json',
        'source_type', 'request_method', 'request_url',
        'response_mode', 'response_path', 'request_config_json',
        'reply_type', 'reply_payload_json',
        'created_at', 'updated_at',
    ];
    const values = [
        definition.id,
        definition.name,
        definition.description ?? null,
        definition.enabled ? 1 : 0,
        definition.priority,
        definition.matchType,
        definition.triggerText ?? null,
        definition.pattern ?? null,
        serializeJson(definition.args),
        definition.sourceType,
        definition.requestMethod ?? null,
        definition.requestUrl ?? null,
        definition.responseMode ?? null,
        definition.responsePath ?? null,
        serializeJson(definition.requestConfig),
        definition.replyType,
        serializeJson(definition.replyPayload),
        definition.createdAt,
        definition.updatedAt,
    ].map(sqlLiteral);

    return `INSERT INTO rule_definition (${columns.join(', ')}) VALUES (${values.join(', ')})`
        + ' ON CONFLICT(id) DO UPDATE SET '
        + 'name = excluded.name, '
        + 'description = excluded.description, '
        + 'enabled = excluded.enabled, '
        + 'priority = excluded.priority, '
        + 'match_type = excluded.match_type, '
        + 'trigger_text = excluded.trigger_text, '
        + 'pattern = excluded.pattern, '
        + 'args_json = excluded.args_json, '
        + 'source_type = excluded.source_type, '
        + 'request_method = excluded.request_method, '
        + 'request_url = excluded.request_url, '
        + 'response_mode = excluded.response_mode, '
        + 'response_path = excluded.response_path, '
        + 'request_config_json = excluded.request_config_json, '
        + 'reply_type = excluded.reply_type, '
        + 'reply_payload_json = excluded.reply_payload_json, '
        + 'updated_at = excluded.updated_at;';
}

function buildMigrationSql(definitions, {includeSchema = true, schemaSql = ''} = {}) {
    const lines = [];
    if (includeSchema && schemaSql.trim()) {
        lines.push(schemaSql.trim(), '');
    }
    lines.push('DELETE FROM rule_definition;');
    for (const definition of definitions) {
        lines.push(buildInsertSql(definition));
    }
    return `${lines.join('\n')}\n`;
}

module.exports = {
    convertKvRulesToDefinitions,
    buildMigrationSql,
    parseRuleConfigList,
};
