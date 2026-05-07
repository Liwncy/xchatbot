import type {TextMessage} from '../types.js';
import {finalizePluginAdminReply} from './plugin-admin-forward-reply.js';
import {PluginAdminService} from './plugin-admin-service.js';
import type {CommonRuleInputPatch, DynamicRuleInputPatch, PluginAdminCommand, RulePluginCategory, RuleInputPatch, WorkflowRuleInputPatch, WorkflowStepSelectorInput} from './plugin-admin-types.js';

const PLUGIN_ADMIN_PREFIX = '插件管理';
const pluginAdminService = new PluginAdminService();
const SUPPORTED_CATEGORIES = new Set<RulePluginCategory>(['common', 'dynamic', 'workflow']);
type RuleFieldName = keyof (CommonRuleInputPatch & DynamicRuleInputPatch & WorkflowRuleInputPatch);

function normalizeCategory(input: string): RulePluginCategory {
    const category = input.trim().toLowerCase();
    if (!SUPPORTED_CATEGORIES.has(category as RulePluginCategory)) {
        throw new Error(`不支持的规则分类：${input}，仅支持 common / dynamic / workflow`);
    }
    return category as RulePluginCategory;
}

function normalizeFieldName(label: string, category: RulePluginCategory): RuleFieldName {
    const normalized = label.trim().toLowerCase();
    switch (normalized) {
        case '名称':
        case 'name':
            return 'name';
        case '关键词':
        case 'keyword':
            return 'keyword';
        case '地址':
        case 'url':
            return 'url';
        case '请求':
        case 'method':
            return 'method';
        case '模式':
        case 'mode':
            return 'mode';
        case '提取':
        case 'jsonpath':
            return 'jsonPath';
        case '回复':
        case 'rtype':
            return 'rType';
        case '请求头':
        case 'headers':
            return 'headers';
        case '请求体':
        case 'body':
            return 'body';
        case '链接标题':
        case 'linktitle':
            return 'linkTitle';
        case '链接描述':
        case 'linkdescription':
            return 'linkDescription';
        case '链接图片':
        case '链接封面':
        case 'linkpicurl':
            return 'linkPicUrl';
        case '语音格式':
        case 'voiceformat':
            return 'voiceFormat';
        case '语音时长':
        case 'voicedurationms':
            return 'voiceDurationMs';
        case '语音降级文案':
        case 'voicefallbacktext':
            return 'voiceFallbackText';
        case '卡片用户名':
        case 'cardusername':
            return 'cardUsername';
        case '卡片昵称':
        case 'cardnickname':
            return 'cardNickname';
        case '卡片别名':
        case 'cardalias':
            return 'cardAlias';
        case 'app类型':
        case 'apptype':
            return 'appType';
        case 'appxml':
        case 'xml':
            return 'appXml';
        case '正则':
        case 'pattern':
            if (category === 'common') break;
            return 'pattern';
        case '匹配':
        case '匹配模式':
        case 'matchmode':
            if (category === 'common') break;
            return 'matchMode';
        case '参数模式':
        case 'argsmode':
            if (category === 'common') break;
            return 'argsMode';
        case '参数分隔符':
        case '分隔符':
        case 'argsdelimiter':
            if (category === 'common') break;
            return 'argsDelimiter';
        case '参数名':
        case 'argsnames':
            if (category === 'common') break;
            return 'argsNames';
        case '必填参数':
        case 'argsrequired':
            if (category === 'common') break;
            return 'argsRequired';
        case '步骤':
        case 'steps':
            if (category !== 'workflow') break;
            return 'steps';
        case '步骤操作':
        case 'stepaction':
            if (category !== 'workflow') break;
            return 'stepAction';
        case '步骤序号':
        case 'stepindex':
            if (category !== 'workflow') break;
            return 'stepIndex';
        case '步骤名称':
        case 'stepname':
            if (category !== 'workflow') break;
            return 'stepName';
        case '目标步骤序号':
        case '目标序号':
        case 'steptargetindex':
            if (category !== 'workflow') break;
            return 'stepTargetIndex';
        case '目标步骤名称':
        case '新步骤名称':
        case 'steptargetname':
            if (category !== 'workflow') break;
            return 'stepTargetName';
        case '步骤内容':
        case 'step':
        case 'steppayload':
            if (category !== 'workflow') break;
            return 'stepPayload';
        case '输出来源':
        case 'outputfrom':
            if (category !== 'workflow') break;
            return 'outputFrom';
        default:
            throw new Error(`不支持的字段：${label}`);
    }

    throw new Error(`分类 ${category} 不支持字段：${label}`);
}

function parseFieldBlock(block: string, category: RulePluginCategory): RuleInputPatch {
    const trimmed = block.trim();
    if (!trimmed) {
        throw new Error('缺少字段内容，请按多行“字段：值”的格式填写');
    }

    const fields: Partial<Record<RuleFieldName, string>> = {};
    const lines = trimmed.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        const matched = line.match(/^([^：:]+)[：:]\s*([\s\S]*)$/u);
        if (!matched) {
            throw new Error(`字段行格式错误：${line}`);
        }
        const fieldName = normalizeFieldName(matched[1], category);
        const inlineValue = matched[2].trim();
        if (inlineValue === '<<<') {
            const blockLines: string[] = [];
            let foundTerminator = false;
            while (index + 1 < lines.length) {
                index += 1;
                const nextLine = lines[index];
                if (nextLine.trim() === '>>>') {
                    foundTerminator = true;
                    break;
                }
                blockLines.push(nextLine);
            }
            if (!foundTerminator) {
                throw new Error(`字段 ${matched[1].trim()} 的多行内容缺少结束标记 >>>`);
            }
            fields[fieldName] = blockLines.join('\n').trim();
            continue;
        }
        fields[fieldName] = inlineValue;
    }

    return fields as RuleInputPatch;
}

function parseWorkflowDetailSelectorBlock(block: string): WorkflowStepSelectorInput {
    const trimmed = block.trim();
    if (!trimmed) {
        throw new Error('缺少详情选项，请使用“步骤序号：N”“步骤名称：xxx”“查看：步骤JSON”或“查看：规则JSON”');
    }

    const fields: WorkflowStepSelectorInput = {};
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        const matched = line.match(/^([^：:]+)[：:]\s*(.+)$/u);
        if (!matched) {
            throw new Error(`字段行格式错误：${line}`);
        }
        const value = matched[2].trim();
        if (!value) {
            throw new Error(`字段 ${matched[1].trim()} 不能为空`);
        }
        const rawFieldName = matched[1].trim().toLowerCase();
        if (rawFieldName === '查看' || rawFieldName === 'view') {
            const normalizedView = value.trim().toLowerCase();
            if (normalizedView === '步骤json' || normalizedView === 'steps-json' || normalizedView === 'stepsjson' || normalizedView === 'raw-steps') {
                fields.view = 'steps-json';
                continue;
            }
            if (normalizedView === '规则json' || normalizedView === 'rule-json' || normalizedView === 'rulejson' || normalizedView === 'raw-rule') {
                fields.view = 'rule-json';
                continue;
            }
            throw new Error('workflow 详情的“查看”仅支持：步骤JSON、规则JSON');
        }
        const fieldName = normalizeFieldName(matched[1], 'workflow');
        if (fieldName !== 'stepIndex' && fieldName !== 'stepName') {
            throw new Error('workflow 详情仅支持字段：步骤序号、步骤名称、查看');
        }
        if (fieldName === 'stepIndex') {
            fields.stepIndex = value;
        } else {
            fields.stepName = value;
        }
    }

    if (fields.view && (fields.stepIndex || fields.stepName)) {
        throw new Error(`查看“${fields.view === 'rule-json' ? '规则JSON' : '步骤JSON'}”时不能同时提供步骤序号或步骤名称`);
    }

    if (!fields.view && !fields.stepIndex && !fields.stepName) {
        throw new Error('缺少详情选项，请使用“步骤序号：N”“步骤名称：xxx”“查看：步骤JSON”或“查看：规则JSON”');
    }

    return fields;
}

export function parsePluginAdminCommand(content: string): PluginAdminCommand {
    const trimmed = content.trim();
    if (!trimmed.startsWith(PLUGIN_ADMIN_PREFIX)) {
        return {action: 'help'};
    }

    const body = trimmed.slice(PLUGIN_ADMIN_PREFIX.length).trim();
    if (!body || body === '帮助') {
        return {action: 'help'};
    }
    if (body === '刷新') {
        return {action: 'refresh'};
    }
    if (body === '列表') {
        return {action: 'list', category: 'common'};
    }

    const listMatched = body.match(/^列表\s+(\S+)$/u);
    if (listMatched) {
        return {action: 'list', category: normalizeCategory(listMatched[1])};
    }

    const searchMatched = body.match(/^搜索\s+(\S+)\s+([\s\S]+)$/u);
    if (searchMatched) {
        return {
            action: 'search',
            category: normalizeCategory(searchMatched[1]),
            query: searchMatched[2].trim(),
        };
    }

    const detailMatched = body.match(/^详情\s+(\S+)\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (detailMatched) {
        const category = normalizeCategory(detailMatched[1]);
        const detailBlock = detailMatched[3]?.trim();
        if (detailBlock) {
            if (category !== 'workflow') {
                throw new Error('仅 workflow 详情支持按步骤查看，格式为：插件管理 详情 workflow <名称> + 换行步骤序号/步骤名称');
            }
            return {
                action: 'detail',
                category,
                name: detailMatched[2].trim(),
                stepSelector: parseWorkflowDetailSelectorBlock(detailBlock),
            };
        }
        return {
            action: 'detail',
            category,
            name: detailMatched[2].trim(),
        };
    }

    const previewDeleteMatched = body.match(/^预览删除\s+(\S+)\s+(\S+)$/u);
    if (previewDeleteMatched) {
        return {
            action: 'delete',
            category: normalizeCategory(previewDeleteMatched[1]),
            name: previewDeleteMatched[2].trim(),
            confirmed: false,
        };
    }

    const deleteMatched = body.match(/^删除\s+(\S+)\s+(\S+)$/u);
    if (deleteMatched) {
        return {
            action: 'delete',
            category: normalizeCategory(deleteMatched[1]),
            name: deleteMatched[2].trim(),
            confirmed: false,
        };
    }

    const confirmDeleteMatched = body.match(/^确认删除\s+(\S+)\s+(\S+)$/u);
    if (confirmDeleteMatched) {
        return {
            action: 'delete',
            category: normalizeCategory(confirmDeleteMatched[1]),
            name: confirmDeleteMatched[2].trim(),
            confirmed: true,
        };
    }

    const previewCopyMatched = body.match(/^预览复制\s+(\S+)\s+(\S+)\s+(\S+)$/u);
    if (previewCopyMatched) {
        return {
            action: 'preview-copy',
            category: normalizeCategory(previewCopyMatched[1]),
            sourceName: previewCopyMatched[2].trim(),
            targetName: previewCopyMatched[3].trim(),
        };
    }

    const copyMatched = body.match(/^复制\s+(\S+)\s+(\S+)\s+(\S+)$/u);
    if (copyMatched) {
        return {
            action: 'copy',
            category: normalizeCategory(copyMatched[1]),
            sourceName: copyMatched[2].trim(),
            targetName: copyMatched[3].trim(),
        };
    }

    const previewRenameMatched = body.match(/^预览重命名\s+(\S+)\s+(\S+)\s+(\S+)$/u);
    if (previewRenameMatched) {
        return {
            action: 'preview-rename',
            category: normalizeCategory(previewRenameMatched[1]),
            sourceName: previewRenameMatched[2].trim(),
            targetName: previewRenameMatched[3].trim(),
        };
    }

    const renameMatched = body.match(/^重命名\s+(\S+)\s+(\S+)\s+(\S+)$/u);
    if (renameMatched) {
        return {
            action: 'rename',
            category: normalizeCategory(renameMatched[1]),
            sourceName: renameMatched[2].trim(),
            targetName: renameMatched[3].trim(),
        };
    }

    const previewRollbackMatched = body.match(/^预览回滚\s+(\S+)$/u);
    if (previewRollbackMatched) {
        return {
            action: 'preview-rollback',
            category: normalizeCategory(previewRollbackMatched[1]),
        };
    }

    const rollbackMatched = body.match(/^回滚\s+(\S+)$/u);
    if (rollbackMatched) {
        return {
            action: 'rollback',
            category: normalizeCategory(rollbackMatched[1]),
        };
    }

    const checkMatched = body.match(/^检查\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (checkMatched) {
        const category = normalizeCategory(checkMatched[1]);
        return {
            action: 'check',
            category,
            fields: parseFieldBlock(checkMatched[2] ?? '', category),
        };
    }

    const previewAddMatched = body.match(/^预览添加\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (previewAddMatched) {
        const category = normalizeCategory(previewAddMatched[1]);
        if (category !== 'workflow') {
            throw new Error('当前仅支持：插件管理 预览添加 workflow');
        }
        return {
            action: 'preview-add',
            category: 'workflow',
            fields: parseFieldBlock(previewAddMatched[2] ?? '', category) as WorkflowRuleInputPatch,
        };
    }

    const addMatched = body.match(/^添加\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (addMatched) {
        const category = normalizeCategory(addMatched[1]);
        return {
            action: 'add',
            category,
            fields: parseFieldBlock(addMatched[2] ?? '', category),
        };
    }

    const previewUpdateMatched = body.match(/^预览修改\s+(\S+)\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (previewUpdateMatched) {
        const category = normalizeCategory(previewUpdateMatched[1]);
        if (category !== 'workflow') {
            throw new Error('当前仅支持：插件管理 预览修改 workflow <名称>');
        }
        return {
            action: 'preview-update',
            category: 'workflow',
            name: previewUpdateMatched[2].trim(),
            fields: parseFieldBlock(previewUpdateMatched[3] ?? '', category) as WorkflowRuleInputPatch,
        };
    }

    const updateMatched = body.match(/^修改\s+(\S+)\s+(\S+)(?:\r?\n([\s\S]*))?$/u);
    if (updateMatched) {
        const category = normalizeCategory(updateMatched[1]);
        return {
            action: 'update',
            category,
            name: updateMatched[2].trim(),
            fields: parseFieldBlock(updateMatched[3] ?? '', category),
        };
    }

    return {action: 'help'};
}

export const pluginAdminPlugin: TextMessage = {
    type: 'text',
    name: 'plugin-admin',
    description: '通过“插件管理 ...”命令管理规则插件（common/dynamic/workflow 完整管理）',
    match: (content) => content.trim().startsWith(PLUGIN_ADMIN_PREFIX),
    async handle(message, env) {
        let command: PluginAdminCommand | null = null;
        try {
            command = parsePluginAdminCommand(message.content ?? '');
            const response = await pluginAdminService.handleCommand(message, env, command);
            return finalizePluginAdminReply(message, command, response);
        } catch (error) {
            return finalizePluginAdminReply(message, command, {
                type: 'text',
                content: error instanceof Error ? error.message : String(error),
            });
        }
    },
};

