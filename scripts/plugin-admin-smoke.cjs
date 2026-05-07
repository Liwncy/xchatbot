const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const compiledRoot = path.join(repoRoot, '.tmp-plugin-admin-smoke');

function resolveCompiledModule(relativePath) {
    const candidates = [
        path.join(compiledRoot, relativePath),
        path.join(compiledRoot, 'src', relativePath),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Cannot find compiled module: ${relativePath}`);
}

const {parsePluginAdminCommand, pluginAdminPlugin} = require(resolveCompiledModule(path.join('plugins', 'system', 'plugin-admin.js')));
const {PluginAdminService} = require(resolveCompiledModule(path.join('plugins', 'system', 'plugin-admin-service.js')));
const {workflowCommonPluginsEngine} = require(resolveCompiledModule(path.join('plugins', 'common', 'workflow.js')));

const COMMON_LIVE_KEY = 'plugins:common:mapping';
const DYNAMIC_LIVE_KEY = 'plugins:parameterized:mapping';
const WORKFLOW_LIVE_KEY = 'plugins:workflow:mapping';
const COMMON_BACKUP_KEY = 'plugins:common:mapping:backup';
const DYNAMIC_BACKUP_KEY = 'plugins:parameterized:mapping:backup';
const WORKFLOW_BACKUP_KEY = 'plugins:workflow:mapping:backup';

class MemoryKV {
    constructor(seedEntries = {}) {
        this.store = new Map(Object.entries(seedEntries));
    }

    async get(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    async put(key, value) {
        this.store.set(key, value);
    }
}

function createOwnerMessage(content = '插件管理 帮助') {
    return {
        platform: 'wechat',
        type: 'text',
        source: 'private',
        from: 'owner-wechat-id',
        to: 'bot-wechat-id',
        timestamp: Math.floor(Date.now() / 1000),
        messageId: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        content,
        raw: {},
    };
}

function createEnv(optionsOrWorkflowRules = {}) {
    const options = Array.isArray(optionsOrWorkflowRules)
        ? {workflowRules: optionsOrWorkflowRules}
        : optionsOrWorkflowRules;
    const {
        commonRules = [],
        dynamicRules = [],
        workflowRules = [],
        overrides = {},
    } = options;

    return {
        XBOT_KV: new MemoryKV({
            [COMMON_LIVE_KEY]: JSON.stringify(commonRules, null, 4),
            [DYNAMIC_LIVE_KEY]: JSON.stringify(dynamicRules, null, 4),
            [WORKFLOW_LIVE_KEY]: JSON.stringify(workflowRules, null, 4),
        }),
        XBOT_DB: {},
        BOT_OWNER_WECHAT_ID: 'owner-wechat-id',
        ...overrides,
    };
}

async function readKvSnapshot(env, keys) {
    return Object.fromEntries(
        await Promise.all(keys.map(async (key) => [key, await env.XBOT_KV.get(key)])),
    );
}

async function main() {
    const service = new PluginAdminService();

    const commonEnv = createEnv({
        commonRules: [
            {
                name: 'hello-common',
                keyword: '你好',
                url: 'https://example.com/hello',
                mode: 'json',
                jsonPath: '$.data.text',
                rType: 'text',
            },
        ],
    });

    const defaultListCommand = parsePluginAdminCommand('插件管理 列表');
    assert.equal(defaultListCommand.action, 'list');
    assert.equal(defaultListCommand.category, 'common');

    const commonListReply = await service.handleCommand(createOwnerMessage(), commonEnv, defaultListCommand);
    assert.equal(commonListReply.type, 'text');
    assert.match(commonListReply.content, /当前 common 分类规则：1 条/);
    assert.match(commonListReply.content, /hello-common/);

    const helpReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 帮助'),
    );
    assert.equal(helpReply.type, 'text');
    assert.match(helpReply.content, /一、查询命令/);
    assert.match(helpReply.content, /二、只读预览命令/);
    assert.match(helpReply.content, /三、写入命令/);
    assert.match(helpReply.content, /五、workflow 常用预览 \/ 增量编辑示例/);
    assert.match(helpReply.content, /六、字段与格式说明/);
    assert.ok(helpReply.content.indexOf('一、查询命令') < helpReply.content.indexOf('二、只读预览命令'));
    assert.ok(helpReply.content.indexOf('二、只读预览命令') < helpReply.content.indexOf('三、写入命令'));
    assert.match(helpReply.content, /插件管理 预览回滚 <分类>/);
    assert.match(helpReply.content, /插件管理 确认删除 <分类> <名称>/);

    const forwardedHelpReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 帮助'),
        commonEnv,
    );
    assert.ok(forwardedHelpReply);
    assert.equal(forwardedHelpReply.type, 'app');
    assert.equal(forwardedHelpReply.appType, 19);
    assert.match(forwardedHelpReply.appXml, /插件管理帮助/);
    assert.match(forwardedHelpReply.appXml, /一、查询命令/);

    const plainListReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 列表'),
        commonEnv,
    );
    assert.ok(plainListReply);
    assert.equal(plainListReply.type, 'text');
    assert.match(plainListReply.content, /当前 common 分类规则：1 条/);

    const commonSearchReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 搜索 common hello'),
    );
    assert.equal(commonSearchReply.type, 'text');
    assert.match(commonSearchReply.content, /搜索结果：common \/ hello/);
    assert.match(commonSearchReply.content, /hello-common/);

    const commonDetailReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 详情 common hello-common'),
    );
    assert.equal(commonDetailReply.type, 'text');
    assert.match(commonDetailReply.content, /规则详情（common）/);
    assert.match(commonDetailReply.content, /- 地址：https:\/\/example.com\/hello/);
    assert.match(commonDetailReply.content, /- 提取：\$\.data\.text/);

    const forwardedShortCommonDetailReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 详情 common hello-common'),
        commonEnv,
    );
    assert.ok(forwardedShortCommonDetailReply);
    assert.equal(forwardedShortCommonDetailReply.type, 'app');
    assert.match(forwardedShortCommonDetailReply.appXml, /插件规则详情/);
    assert.match(forwardedShortCommonDetailReply.appXml, /hello-common/);

    const checkCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand([
            '插件管理 检查 common',
            '名称：common-link',
            '关键词：整点啊|走不走',
            '地址：https://example.com/drink',
            '模式：text',
            '回复：link',
            '链接标题：整点啊',
            '链接描述：测试链接',
            '链接图片：https://example.com/pic.png',
        ].join('\n')),
    );
    assert.equal(checkCommonReply.type, 'text');
    assert.match(checkCommonReply.content, /规则校验通过（common）/);
    assert.match(checkCommonReply.content, /common-link/);

    const addCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand([
            '插件管理 添加 common',
            '名称：common-link',
            '关键词：整点啊|走不走',
            '地址：https://example.com/drink',
            '模式：text',
            '回复：link',
            '链接标题：整点啊',
            '链接描述：测试链接',
            '链接图片：https://example.com/pic.png',
        ].join('\n')),
    );
    assert.equal(addCommonReply.type, 'text');
    assert.match(addCommonReply.content, /插件已添加成功/);
    assert.match(addCommonReply.content, /common-link/);

    const updateCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand([
            '插件管理 修改 common common-link',
            '模式：json',
            '提取：$.data.url',
            '请求：POST',
            '请求头：<<<',
            '{"Accept":"application/json"}',
            '>>>',
            '请求体：<<<',
            '{"foo":"bar"}',
            '>>>',
        ].join('\n')),
    );
    assert.equal(updateCommonReply.type, 'text');
    assert.match(updateCommonReply.content, /插件已修改成功/);
    assert.match(updateCommonReply.content, /请求头/);
    assert.match(updateCommonReply.content, /请求体/);

    const updatedCommonDetailReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 详情 common common-link'),
    );
    assert.equal(updatedCommonDetailReply.type, 'text');
    assert.match(updatedCommonDetailReply.content, /- 模式：json/);
    assert.match(updatedCommonDetailReply.content, /- 请求：POST/);
    assert.match(updatedCommonDetailReply.content, /- 提取：\$\.data\.url/);
    assert.match(updatedCommonDetailReply.content, /- 请求头：/);
    assert.match(updatedCommonDetailReply.content, /"Accept": "application\/json"/);
    assert.match(updatedCommonDetailReply.content, /- 请求体：/);
    assert.match(updatedCommonDetailReply.content, /"foo": "bar"/);
    assert.match(updatedCommonDetailReply.content, /- 链接标题：整点啊/);

    const forwardedCommonDetailReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 详情 common common-link'),
        commonEnv,
    );
    assert.ok(forwardedCommonDetailReply);
    assert.equal(forwardedCommonDetailReply.type, 'app');
    assert.match(forwardedCommonDetailReply.appXml, /请求头：/);
    assert.match(forwardedCommonDetailReply.appXml, /application\/json/);
    assert.match(forwardedCommonDetailReply.appXml, /请求体：/);
    assert.match(forwardedCommonDetailReply.appXml, /&quot;foo&quot;: &quot;bar&quot;/);
    assert.doesNotMatch(forwardedCommonDetailReply.appXml, /对象\(1键\)/);

    const previewCopyCommonCommand = parsePluginAdminCommand('插件管理 预览复制 common common-link common-link-preview');
    assert.equal(previewCopyCommonCommand.action, 'preview-copy');
    assert.equal(previewCopyCommonCommand.category, 'common');
    assert.equal(previewCopyCommonCommand.sourceName, 'common-link');
    assert.equal(previewCopyCommonCommand.targetName, 'common-link-preview');

    const previewRenameCommonCommand = parsePluginAdminCommand('插件管理 预览重命名 common common-link common-link-preview-rename');
    assert.equal(previewRenameCommonCommand.action, 'preview-rename');
    assert.equal(previewRenameCommonCommand.category, 'common');
    assert.equal(previewRenameCommonCommand.sourceName, 'common-link');
    assert.equal(previewRenameCommonCommand.targetName, 'common-link-preview-rename');

    const previewRollbackCommonCommand = parsePluginAdminCommand('插件管理 预览回滚 common');
    assert.equal(previewRollbackCommonCommand.action, 'preview-rollback');
    assert.equal(previewRollbackCommonCommand.category, 'common');

    const previewCopyCommonBefore = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewCopyCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        previewCopyCommonCommand,
    );
    const previewCopyCommonAfter = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewCopyCommonReply.type, 'text');
    assert.match(previewCopyCommonReply.content, /规则预览复制（未写入）/);
    assert.match(previewCopyCommonReply.content, /- 原名称：common-link/);
    assert.match(previewCopyCommonReply.content, /- 新名称：common-link-preview/);
    assert.match(previewCopyCommonReply.content, /本次仅预览，未写入 KV。/);
    assert.deepEqual(previewCopyCommonBefore, previewCopyCommonAfter);

    const previewRenameCommonBefore = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewRenameCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        previewRenameCommonCommand,
    );
    const previewRenameCommonAfter = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewRenameCommonReply.type, 'text');
    assert.match(previewRenameCommonReply.content, /规则预览重命名（未写入）/);
    assert.match(previewRenameCommonReply.content, /- 原名称：common-link/);
    assert.match(previewRenameCommonReply.content, /- 新名称：common-link-preview-rename/);
    assert.match(previewRenameCommonReply.content, /本次仅预览，未写入 KV。/);
    assert.deepEqual(previewRenameCommonBefore, previewRenameCommonAfter);

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            commonEnv,
            parsePluginAdminCommand('插件管理 预览重命名 common missing-common missing-common-renamed'),
        ),
        /未找到 common 规则：missing-common/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            commonEnv,
            parsePluginAdminCommand('插件管理 预览重命名 common common-link hello-common'),
        ),
        /规则名称已存在：hello-common/,
    );

    const copyCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 复制 common common-link common-link-copy'),
    );
    assert.equal(copyCommonReply.type, 'text');
    assert.match(copyCommonReply.content, /插件已复制成功/);

    const renameCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 重命名 common common-link-copy common-link-archive'),
    );
    assert.equal(renameCommonReply.type, 'text');
    assert.match(renameCommonReply.content, /插件已重命名成功/);

    const previewDeleteCommonAliasCommand = parsePluginAdminCommand('插件管理 预览删除 common common-link-archive');
    assert.equal(previewDeleteCommonAliasCommand.action, 'delete');
    assert.equal(previewDeleteCommonAliasCommand.category, 'common');
    assert.equal(previewDeleteCommonAliasCommand.name, 'common-link-archive');
    assert.equal(previewDeleteCommonAliasCommand.confirmed, false);

    const previewDeleteCommonAliasBefore = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewDeleteCommonAliasReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        previewDeleteCommonAliasCommand,
    );
    const previewDeleteCommonAliasAfter = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewDeleteCommonAliasReply.type, 'text');
    assert.match(previewDeleteCommonAliasReply.content, /规则预览删除（未写入）/);
    assert.match(previewDeleteCommonAliasReply.content, /common-link-archive/);
    assert.match(previewDeleteCommonAliasReply.content, /确认删除 common common-link-archive/);
    assert.deepEqual(previewDeleteCommonAliasBefore, previewDeleteCommonAliasAfter);

    const previewDeleteCommonBefore = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewDeleteCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 删除 common common-link-archive'),
    );
    const previewDeleteCommonAfter = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewDeleteCommonReply.type, 'text');
    assert.match(previewDeleteCommonReply.content, /规则预览删除（未写入）/);
    assert.match(previewDeleteCommonReply.content, /确认删除 common common-link-archive/);
    assert.deepEqual(previewDeleteCommonBefore, previewDeleteCommonAfter);

    const deleteCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 确认删除 common common-link-archive'),
    );
    assert.equal(deleteCommonReply.type, 'text');
    assert.match(deleteCommonReply.content, /插件已删除/);

    const previewRollbackCommonBefore = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewRollbackCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        previewRollbackCommonCommand,
    );
    const previewRollbackCommonAfter = await readKvSnapshot(commonEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewRollbackCommonReply.type, 'text');
    assert.match(previewRollbackCommonReply.content, /规则预览回滚（未写入）/);
    assert.match(previewRollbackCommonReply.content, /- 分类：common/);
    assert.match(previewRollbackCommonReply.content, /恢复新增：common-link-archive/);
    assert.match(previewRollbackCommonReply.content, /本次仅预览，未写入 KV。/);
    assert.match(previewRollbackCommonReply.content, /如确认执行，请发送：插件管理 回滚 common/);
    assert.deepEqual(previewRollbackCommonBefore, previewRollbackCommonAfter);

    const rollbackCommonReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 回滚 common'),
    );
    assert.equal(rollbackCommonReply.type, 'text');
    assert.match(rollbackCommonReply.content, /已完成回滚/);
    assert.match(rollbackCommonReply.content, /恢复新增：common-link-archive/);

    const restoredCommonDetailReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 详情 common common-link-archive'),
    );
    assert.equal(restoredCommonDetailReply.type, 'text');
    assert.match(restoredCommonDetailReply.content, /common-link-archive/);

    const previewRollbackNoBackupEnv = createEnv({
        commonRules: [
            {
                name: 'preview-only-common',
                keyword: '预览回滚',
                url: 'https://example.com/preview',
                mode: 'text',
                rType: 'text',
            },
        ],
    });
    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            previewRollbackNoBackupEnv,
            parsePluginAdminCommand('插件管理 预览回滚 common'),
        ),
        /当前没有可回滚的 common 备份/,
    );

    const previewRollbackSameEnv = createEnv({
        commonRules: [
            {
                name: 'same-backup-common',
                keyword: 'same-backup',
                url: 'https://example.com/same',
                mode: 'text',
                rType: 'text',
            },
        ],
    });
    const sameBackupRaw = await previewRollbackSameEnv.XBOT_KV.get(COMMON_LIVE_KEY);
    await previewRollbackSameEnv.XBOT_KV.put(COMMON_BACKUP_KEY, sameBackupRaw);
    const previewRollbackSameBefore = await readKvSnapshot(previewRollbackSameEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    const previewRollbackSameReply = await service.handleCommand(
        createOwnerMessage(),
        previewRollbackSameEnv,
        parsePluginAdminCommand('插件管理 预览回滚 common'),
    );
    const previewRollbackSameAfter = await readKvSnapshot(previewRollbackSameEnv, [COMMON_LIVE_KEY, COMMON_BACKUP_KEY]);
    assert.equal(previewRollbackSameReply.type, 'text');
    assert.match(previewRollbackSameReply.content, /规则预览回滚（未写入）/);
    assert.match(previewRollbackSameReply.content, /当前 live 与备份一致，本次回滚未产生名称级变化/);
    assert.deepEqual(previewRollbackSameBefore, previewRollbackSameAfter);

    const dynamicEnv = createEnv({
        dynamicRules: [
            {
                name: 'station-query',
                keyword: '车次',
                matchMode: 'prefix',
                url: 'https://example.com/train?q={{all}}',
                mode: 'text',
                rType: 'text',
                args: {
                    mode: 'tail',
                    names: ['query'],
                    required: ['query'],
                },
            },
        ],
    });

    const checkDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand([
            '插件管理 检查 dynamic',
            '名称：weather-regex',
            '正则：^天气\\s+(.+)$',
            '匹配模式：regex',
            '参数模式：regex',
            '参数名：query',
            '地址：https://example.com/weather?q={{query}}',
            '模式：json',
            '提取：$.data.text',
            '回复：text',
        ].join('\n')),
    );
    assert.equal(checkDynamicReply.type, 'text');
    assert.match(checkDynamicReply.content, /规则校验通过（dynamic）/);
    assert.match(checkDynamicReply.content, /weather-regex/);

    const addDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand([
            '插件管理 添加 dynamic',
            '名称：weather-regex',
            '正则：^天气\\s+(.+)$',
            '匹配模式：regex',
            '参数模式：regex',
            '参数名：query',
            '地址：https://example.com/weather?q={{query}}',
            '模式：json',
            '提取：$.data.text',
            '回复：text',
        ].join('\n')),
    );
    assert.equal(addDynamicReply.type, 'text');
    assert.match(addDynamicReply.content, /插件已添加成功/);
    assert.match(addDynamicReply.content, /weather-regex/);

    const dynamicSearchReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 搜索 dynamic weather'),
    );
    assert.equal(dynamicSearchReply.type, 'text');
    assert.match(dynamicSearchReply.content, /weather-regex/);

    const dynamicDetailReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 详情 dynamic weather-regex'),
    );
    assert.equal(dynamicDetailReply.type, 'text');
    assert.match(dynamicDetailReply.content, /规则详情（dynamic）/);
    assert.match(dynamicDetailReply.content, /- 匹配模式：regex/);
    assert.match(dynamicDetailReply.content, /- 参数模式：regex/);
    assert.match(dynamicDetailReply.content, /- 参数名：query/);

    const updateDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand([
            '插件管理 修改 dynamic weather-regex',
            '请求：POST',
            '请求体：<<<',
            '{"q":"{{query}}"}',
            '>>>',
        ].join('\n')),
    );
    assert.equal(updateDynamicReply.type, 'text');
    assert.match(updateDynamicReply.content, /插件已修改成功/);
    assert.match(updateDynamicReply.content, /请求体/);

    const updatedDynamicDetailReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 详情 dynamic weather-regex'),
    );
    assert.equal(updatedDynamicDetailReply.type, 'text');
    assert.match(updatedDynamicDetailReply.content, /- 请求：POST/);
    assert.match(updatedDynamicDetailReply.content, /- 请求体：/);
    assert.match(updatedDynamicDetailReply.content, /"q": "\{\{query\}\}"/);

    const copyDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 复制 dynamic weather-regex weather-regex-copy'),
    );
    assert.equal(copyDynamicReply.type, 'text');
    assert.match(copyDynamicReply.content, /插件已复制成功/);

    const renameDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 重命名 dynamic weather-regex-copy weather-regex-archive'),
    );
    assert.equal(renameDynamicReply.type, 'text');
    assert.match(renameDynamicReply.content, /插件已重命名成功/);

    const previewDeleteDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 删除 dynamic weather-regex-archive'),
    );
    assert.equal(previewDeleteDynamicReply.type, 'text');
    assert.match(previewDeleteDynamicReply.content, /确认删除 dynamic weather-regex-archive/);

    const deleteDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 确认删除 dynamic weather-regex-archive'),
    );
    assert.equal(deleteDynamicReply.type, 'text');
    assert.match(deleteDynamicReply.content, /插件已删除/);

    const rollbackDynamicReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 回滚 dynamic'),
    );
    assert.equal(rollbackDynamicReply.type, 'text');
    assert.match(rollbackDynamicReply.content, /已完成回滚/);
    assert.match(rollbackDynamicReply.content, /恢复新增：weather-regex-archive/);

    const restoredDynamicDetailReply = await service.handleCommand(
        createOwnerMessage(),
        dynamicEnv,
        parsePluginAdminCommand('插件管理 详情 dynamic weather-regex-archive'),
    );
    assert.equal(restoredDynamicDetailReply.type, 'text');
    assert.match(restoredDynamicDetailReply.content, /weather-regex-archive/);

    const inlineCommonEnv = createEnv({
        commonRules: [
            {
                name: 'kv-common-only',
                keyword: 'kv',
                url: 'https://example.com/kv',
                mode: 'text',
                rType: 'text',
            },
        ],
        overrides: {
            COMMON_PLUGINS_CONFIG: JSON.stringify([
                {
                    name: 'inline-common-only',
                    keyword: 'inline',
                    url: 'https://example.com/inline',
                    mode: 'text',
                    rType: 'text',
                },
            ]),
        },
    });

    const inlineCommonListReply = await service.handleCommand(
        createOwnerMessage(),
        inlineCommonEnv,
        parsePluginAdminCommand('插件管理 列表 common'),
    );
    assert.equal(inlineCommonListReply.type, 'text');
    assert.match(inlineCommonListReply.content, /警告：当前通用插件由环境变量内联配置接管/);
    assert.match(inlineCommonListReply.content, /kv-common-only/);

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            inlineCommonEnv,
            parsePluginAdminCommand([
                '插件管理 添加 common',
                '名称：inline-write-blocked',
                '关键词：inline',
                '地址：https://example.com/blocked',
                '模式：text',
                '回复：text',
            ].join('\n')),
        ),
        /当前通用插件由环境变量内联配置接管，聊天命令修改 KV 不会生效/,
    );

    const env = createEnv([
        {
            name: 'existing-workflow',
            keyword: 'existing',
            mode: 'workflow',
            rType: 'text',
            steps: [
                {
                    name: 'seed',
                    url: 'https://example.com/seed',
                    mode: 'text',
                    saveAs: 'seed',
                },
            ],
            outputFrom: 'seed',
        },
    ]);

    const addWorkflowCommandText = [
        '插件管理 添加 workflow',
        '名称：weather-workflow',
        '正则：^天气\\s+(.+)$',
        '匹配模式：regex',
        '参数模式：regex',
        '参数名：query',
        '回复：text',
        '步骤：<<<',
        '[{"name":"search","url":"https://example.com/weather?q={{query}}","mode":"json","jsonPath":"$.data.text","saveAs":"result"}]',
        '>>>',
        '输出来源：result',
    ].join('\n');

    const addCommand = parsePluginAdminCommand(addWorkflowCommandText);
    assert.equal(addCommand.action, 'add');
    assert.equal(addCommand.category, 'workflow');
    assert.equal(addCommand.fields.outputFrom, 'result');
    assert.match(String(addCommand.fields.steps), /search/);

    const previewAddCommandText = [
        '插件管理 预览添加 workflow',
        '名称：weather-workflow-preview',
        '关键词：天气预览',
        '回复：text',
        '步骤：<<<',
        '[{"name":"search","url":"https://example.com/weather?q={{keyword}}","mode":"text","saveAs":"result"}]',
        '>>>',
        '输出来源：result',
    ].join('\n');
    const previewAddCommand = parsePluginAdminCommand(previewAddCommandText);
    assert.equal(previewAddCommand.action, 'preview-add');
    assert.equal(previewAddCommand.category, 'workflow');
    assert.equal(previewAddCommand.fields.name, 'weather-workflow-preview');

    const updateByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：删除',
        '步骤名称：render',
    ].join('\n'));
    assert.equal(updateByNameCommand.action, 'update');
    assert.equal(updateByNameCommand.category, 'workflow');
    assert.equal(updateByNameCommand.fields.stepName, 'render');

    const detailByNameCommand = parsePluginAdminCommand([
        '插件管理 详情 workflow weather-workflow',
        '步骤名称：search',
    ].join('\n'));
    assert.equal(detailByNameCommand.action, 'detail');
    assert.equal(detailByNameCommand.category, 'workflow');
    assert.equal(detailByNameCommand.stepSelector?.stepName, 'search');

    const rawStepsDetailCommand = parsePluginAdminCommand([
        '插件管理 详情 workflow weather-workflow',
        '查看：步骤JSON',
    ].join('\n'));
    assert.equal(rawStepsDetailCommand.action, 'detail');
    assert.equal(rawStepsDetailCommand.category, 'workflow');
    assert.equal(rawStepsDetailCommand.stepSelector?.view, 'steps-json');

    const rawRuleDetailCommand = parsePluginAdminCommand([
        '插件管理 详情 workflow weather-workflow',
        '查看：规则JSON',
    ].join('\n'));
    assert.equal(rawRuleDetailCommand.action, 'detail');
    assert.equal(rawRuleDetailCommand.category, 'workflow');
    assert.equal(rawRuleDetailCommand.stepSelector?.view, 'rule-json');

    const moveByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：移动',
        '步骤名称：render',
        '目标步骤序号：1',
    ].join('\n'));
    assert.equal(moveByNameCommand.action, 'update');
    assert.equal(moveByNameCommand.category, 'workflow');
    assert.equal(moveByNameCommand.fields.stepName, 'render');
    assert.equal(moveByNameCommand.fields.stepTargetIndex, '1');

    const renameByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：重命名',
        '步骤名称：render',
        '目标步骤名称：render-text',
    ].join('\n'));
    assert.equal(renameByNameCommand.action, 'update');
    assert.equal(renameByNameCommand.category, 'workflow');
    assert.equal(renameByNameCommand.fields.stepName, 'render');
    assert.equal(renameByNameCommand.fields.stepTargetName, 'render-text');

    const renameByIndexCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：重命名',
        '步骤序号：1',
        '目标步骤名称：render-step',
    ].join('\n'));
    assert.equal(renameByIndexCommand.action, 'update');
    assert.equal(renameByIndexCommand.category, 'workflow');
    assert.equal(renameByIndexCommand.fields.stepIndex, '1');
    assert.equal(renameByIndexCommand.fields.stepTargetName, 'render-step');

    const copyByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：复制',
        '步骤名称：render-step',
        '目标步骤序号：2',
        '步骤内容：<<<',
        '{"name":"render-copy","saveAs":"renderCopy"}',
        '>>>',
    ].join('\n'));
    assert.equal(copyByNameCommand.action, 'update');
    assert.equal(copyByNameCommand.category, 'workflow');
    assert.equal(copyByNameCommand.fields.stepName, 'render-step');
    assert.equal(copyByNameCommand.fields.stepTargetIndex, '2');
    assert.match(String(copyByNameCommand.fields.stepPayload), /render-copy/);

    const previewCopyCommand = parsePluginAdminCommand([
        '插件管理 预览修改 workflow weather-workflow',
        '步骤操作：复制',
        '步骤名称：render-step',
        '目标步骤序号：2',
        '步骤内容：<<<',
        '{"name":"render-copy","saveAs":"renderCopy"}',
        '>>>',
    ].join('\n'));
    assert.equal(previewCopyCommand.action, 'preview-update');
    assert.equal(previewCopyCommand.category, 'workflow');
    assert.equal(previewCopyCommand.name, 'weather-workflow');
    assert.equal(previewCopyCommand.fields.stepName, 'render-step');

    const previewFieldUpdateCommand = parsePluginAdminCommand([
        '插件管理 预览修改 workflow weather-workflow',
        '步骤操作：修改',
        '步骤名称：render-step',
        '步骤内容：<<<',
        '{"name":"render-preview","saveAs":"finalText","url":"https://example.com/render-v2?value={{result}}","mode":"json","jsonPath":"$.data.final","method":"POST"}',
        '>>>',
        '输出来源：finalText',
    ].join('\n'));
    assert.equal(previewFieldUpdateCommand.action, 'preview-update');
    assert.equal(previewFieldUpdateCommand.category, 'workflow');
    assert.equal(previewFieldUpdateCommand.name, 'weather-workflow');

    const previewRuleCopyCommand = parsePluginAdminCommand('插件管理 预览复制 workflow weather-workflow weather-workflow-preview-copy');
    assert.equal(previewRuleCopyCommand.action, 'preview-copy');
    assert.equal(previewRuleCopyCommand.category, 'workflow');
    assert.equal(previewRuleCopyCommand.sourceName, 'weather-workflow');
    assert.equal(previewRuleCopyCommand.targetName, 'weather-workflow-preview-copy');

    const previewRuleRenameCommand = parsePluginAdminCommand('插件管理 预览重命名 workflow weather-workflow weather-workflow-preview-rename');
    assert.equal(previewRuleRenameCommand.action, 'preview-rename');
    assert.equal(previewRuleRenameCommand.category, 'workflow');
    assert.equal(previewRuleRenameCommand.sourceName, 'weather-workflow');
    assert.equal(previewRuleRenameCommand.targetName, 'weather-workflow-preview-rename');

    const previewRollbackWorkflowCommand = parsePluginAdminCommand('插件管理 预览回滚 workflow');
    assert.equal(previewRollbackWorkflowCommand.action, 'preview-rollback');
    assert.equal(previewRollbackWorkflowCommand.category, 'workflow');

    const disableByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：禁用',
        '步骤名称：render-copy',
    ].join('\n'));
    assert.equal(disableByNameCommand.action, 'update');
    assert.equal(disableByNameCommand.category, 'workflow');
    assert.equal(disableByNameCommand.fields.stepName, 'render-copy');

    const enableByNameCommand = parsePluginAdminCommand([
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：启用',
        '步骤名称：render-copy',
    ].join('\n'));
    assert.equal(enableByNameCommand.action, 'update');
    assert.equal(enableByNameCommand.category, 'workflow');
    assert.equal(enableByNameCommand.fields.stepName, 'render-copy');

    const checkCommand = parsePluginAdminCommand(addWorkflowCommandText.replace('添加 workflow', '检查 workflow'));
    const checkReply = await service.handleCommand(createOwnerMessage(), env, checkCommand);
    assert.equal(checkReply.type, 'text');
    assert.match(checkReply.content, /规则校验通过（workflow）/);

    const addReply = await service.handleCommand(createOwnerMessage(), env, addCommand);
    assert.equal(addReply.type, 'text');
    assert.match(addReply.content, /插件已添加成功/);
    assert.match(addReply.content, /weather-workflow/);

    const previewAddBeforeRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    const previewAddReply = await service.handleCommand(createOwnerMessage(), env, previewAddCommand);
    const previewAddAfterRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    assert.equal(previewAddReply.type, 'text');
    assert.match(previewAddReply.content, /规则预览添加（未写入）/);
    assert.match(previewAddReply.content, /- 分类：workflow/);
    assert.match(previewAddReply.content, /weather-workflow-preview/);
    assert.match(previewAddReply.content, /步骤预览：/);
    assert.match(previewAddReply.content, /步骤1：search/);
    assert.match(previewAddReply.content, /本次仅预览，未写入 KV。/);
    assert.equal(previewAddBeforeRaw, previewAddAfterRaw);

    const searchReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 搜索 workflow weather'),
    );
    assert.equal(searchReply.type, 'text');
    assert.match(searchReply.content, /weather-workflow/);

    const detailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(detailReply.type, 'text');
    assert.match(detailReply.content, /规则详情（workflow）/);
    assert.match(detailReply.content, /步骤数：1/);
    assert.match(detailReply.content, /输出来源：result/);

    const stepDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        detailByNameCommand,
    );
    assert.equal(stepDetailReply.type, 'text');
    assert.match(stepDetailReply.content, /规则步骤详情（workflow）/);
    assert.match(stepDetailReply.content, /步骤名称：search/);
    assert.match(stepDetailReply.content, /是否命中输出来源：是/);

    const rawStepsDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        rawStepsDetailCommand,
    );
    assert.equal(rawStepsDetailReply.type, 'text');
    assert.match(rawStepsDetailReply.content, /规则步骤原始JSON（workflow）/);
    assert.match(rawStepsDetailReply.content, /"name": "search"/);
    assert.match(rawStepsDetailReply.content, /"saveAs": "result"/);

    const rawRuleDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        rawRuleDetailCommand,
    );
    assert.equal(rawRuleDetailReply.type, 'text');
    assert.match(rawRuleDetailReply.content, /规则原始JSON（workflow）/);
    assert.match(rawRuleDetailReply.content, /"mode": "workflow"/);
    assert.match(rawRuleDetailReply.content, /"steps": \[/);

    const appendWorkflowStepCommandText = [
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：追加',
        '步骤内容：<<<',
        '{"name":"render","url":"https://example.com/render?value={{result}}","mode":"text","saveAs":"final"}',
        '>>>',
        '输出来源：final',
    ].join('\n');

    const appendReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand(appendWorkflowStepCommandText),
    );
    assert.equal(appendReply.type, 'text');
    assert.match(appendReply.content, /插件已修改成功/);
    assert.match(appendReply.content, /步骤/);
    assert.match(appendReply.content, /输出来源/);

    const appendedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(appendedDetailReply.type, 'text');
    assert.match(appendedDetailReply.content, /步骤数：2/);
    assert.match(appendedDetailReply.content, /输出来源：final/);
    assert.match(appendedDetailReply.content, /步骤2：render/);

    const insertWorkflowStepCommandText = [
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：插入',
        '步骤序号：2',
        '步骤内容：<<<',
        '{"name":"normalize","url":"https://example.com/normalize?value={{result}}","mode":"text","saveAs":"normalized"}',
        '>>>',
    ].join('\n');

    const insertReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand(insertWorkflowStepCommandText),
    );
    assert.equal(insertReply.type, 'text');
    assert.match(insertReply.content, /插件已修改成功/);
    assert.match(insertReply.content, /步骤/);

    const insertedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(insertedDetailReply.type, 'text');
    assert.match(insertedDetailReply.content, /步骤数：3/);
    assert.match(insertedDetailReply.content, /步骤2：normalize/);

    const stepDetailByIndexReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand([
            '插件管理 详情 workflow weather-workflow',
            '步骤序号：2',
        ].join('\n')),
    );
    assert.equal(stepDetailByIndexReply.type, 'text');
    assert.match(stepDetailByIndexReply.content, /规则步骤详情（workflow）/);
    assert.match(stepDetailByIndexReply.content, /步骤序号：2/);
    assert.match(stepDetailByIndexReply.content, /步骤名称：normalize/);

    const moveReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        moveByNameCommand,
    );
    assert.equal(moveReply.type, 'text');
    assert.match(moveReply.content, /插件已修改成功/);
    assert.match(moveReply.content, /步骤/);

    const movedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(movedDetailReply.type, 'text');
    assert.match(movedDetailReply.content, /步骤1：render/);
    assert.match(movedDetailReply.content, /步骤2：search/);
    assert.match(movedDetailReply.content, /步骤3：normalize/);

    const renameReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        renameByNameCommand,
    );
    assert.equal(renameReply.type, 'text');
    assert.match(renameReply.content, /插件已修改成功/);
    assert.match(renameReply.content, /步骤/);

    const renamedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(renamedDetailReply.type, 'text');
    assert.match(renamedDetailReply.content, /步骤1：render-text/);
    assert.doesNotMatch(renamedDetailReply.content, /步骤1：render \|/);

    const renameByIndexReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        renameByIndexCommand,
    );
    assert.equal(renameByIndexReply.type, 'text');
    assert.match(renameByIndexReply.content, /插件已修改成功/);
    assert.match(renameByIndexReply.content, /步骤/);

    const renamedByIndexDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(renamedByIndexDetailReply.type, 'text');
    assert.match(renamedByIndexDetailReply.content, /步骤1：render-step/);

    const previewFieldBeforeRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    const previewFieldReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewFieldUpdateCommand,
    );
    const previewFieldAfterRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    assert.equal(previewFieldReply.type, 'text');
    assert.match(previewFieldReply.content, /规则预览修改（未写入）/);
    assert.match(previewFieldReply.content, /- 分类：workflow/);
    assert.match(previewFieldReply.content, /输出来源：final -> finalText/);
    assert.match(previewFieldReply.content, /名称：render-step -> render-preview/);
    assert.match(previewFieldReply.content, /saveAs：final -> finalText/);
    assert.match(previewFieldReply.content, /地址：https:\/\/example.com\/render\?value=\{\{result\}\} -> https:\/\/example.com\/render-v2\?value=\{\{result\}\}/);
    assert.match(previewFieldReply.content, /模式：text -> json/);
    assert.match(previewFieldReply.content, /提取：（空） -> \$\.data\.final/);
    assert.match(previewFieldReply.content, /请求：GET -> POST/);
    assert.equal(previewFieldBeforeRaw, previewFieldAfterRaw);

    const previewBeforeRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    const previewReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewCopyCommand,
    );
    const previewAfterRaw = await env.XBOT_KV.get(WORKFLOW_LIVE_KEY);
    assert.equal(previewReply.type, 'text');
    assert.match(previewReply.content, /规则预览修改（未写入）/);
    assert.match(previewReply.content, /- 分类：workflow/);
    assert.match(previewReply.content, /步骤数：3 -> 4/);
    assert.match(previewReply.content, /步骤差异：/);
    assert.match(previewReply.content, /步骤2：search .* -> render-copy/);
    assert.match(previewReply.content, /本次仅预览，未写入 KV。/);
    assert.equal(previewBeforeRaw, previewAfterRaw);

    const previewDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(previewDetailReply.type, 'text');
    assert.match(previewDetailReply.content, /步骤数：3/);
    assert.doesNotMatch(previewDetailReply.content, /render-copy/);

    const copyReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        copyByNameCommand,
    );
    assert.equal(copyReply.type, 'text');
    assert.match(copyReply.content, /插件已修改成功/);
    assert.match(copyReply.content, /步骤/);

    const copiedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(copiedDetailReply.type, 'text');
    assert.match(copiedDetailReply.content, /步骤数：4/);
    assert.match(copiedDetailReply.content, /步骤1：render-step/);
    assert.match(copiedDetailReply.content, /步骤2：render-copy[\s\S]*?启用：是[\s\S]*?saveAs：renderCopy/);
    assert.match(copiedDetailReply.content, /步骤3：search/);
    assert.match(copiedDetailReply.content, /步骤4：normalize/);

    const disableReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        disableByNameCommand,
    );
    assert.equal(disableReply.type, 'text');
    assert.match(disableReply.content, /插件已修改成功/);
    assert.match(disableReply.content, /步骤/);

    const disabledDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(disabledDetailReply.type, 'text');
    assert.match(disabledDetailReply.content, /步骤2：render-copy[\s\S]*?启用：否[\s\S]*?saveAs：renderCopy/);

    const enableReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        enableByNameCommand,
    );
    assert.equal(enableReply.type, 'text');
    assert.match(enableReply.content, /插件已修改成功/);
    assert.match(enableReply.content, /步骤/);

    const enabledAgainDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(enabledAgainDetailReply.type, 'text');
    assert.match(enabledAgainDetailReply.content, /步骤2：render-copy[\s\S]*?启用：是[\s\S]*?saveAs：renderCopy/);

    const updateWorkflowStepCommandText = [
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：修改',
        '步骤名称：render-step',
        '步骤内容：<<<',
        '{"saveAs":"finalText"}',
        '>>>',
        '输出来源：finalText',
    ].join('\n');

    const updateReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand(updateWorkflowStepCommandText),
    );
    assert.equal(updateReply.type, 'text');
    assert.match(updateReply.content, /插件已修改成功/);
    assert.match(updateReply.content, /步骤/);
    assert.match(updateReply.content, /输出来源/);

    const updatedDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(updatedDetailReply.type, 'text');
    assert.match(updatedDetailReply.content, /步骤数：4/);
    assert.match(updatedDetailReply.content, /输出来源：finalText/);
    assert.match(updatedDetailReply.content, /步骤1：render-step[\s\S]*?saveAs：finalText/);

    const deleteWorkflowStepCommandText = [
        '插件管理 修改 workflow weather-workflow',
        '步骤操作：删除',
        '步骤名称：normalize',
    ].join('\n');

    const deleteStepReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand(deleteWorkflowStepCommandText),
    );
    assert.equal(deleteStepReply.type, 'text');
    assert.match(deleteStepReply.content, /插件已修改成功/);
    assert.match(deleteStepReply.content, /步骤/);

    const deletedStepDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow'),
    );
    assert.equal(deletedStepDetailReply.type, 'text');
    assert.match(deletedStepDetailReply.content, /步骤数：3/);
    assert.match(deletedStepDetailReply.content, /步骤2：render-copy[\s\S]*?saveAs：renderCopy/);
    assert.doesNotMatch(deletedStepDetailReply.content, /步骤4：normalize/);
    assert.match(deletedStepDetailReply.content, /输出来源：finalText/);

    const previewRuleCopyBefore = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    const previewRuleCopyReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewRuleCopyCommand,
    );
    const previewRuleCopyAfter = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    assert.equal(previewRuleCopyReply.type, 'text');
    assert.match(previewRuleCopyReply.content, /规则预览复制（未写入）/);
    assert.match(previewRuleCopyReply.content, /- 原名称：weather-workflow/);
    assert.match(previewRuleCopyReply.content, /- 新名称：weather-workflow-preview-copy/);
    assert.match(previewRuleCopyReply.content, /- 步骤数：3/);
    assert.match(previewRuleCopyReply.content, /- 输出来源：finalText/);
    assert.match(previewRuleCopyReply.content, /步骤预览：/);
    assert.match(previewRuleCopyReply.content, /步骤1：render-step/);
    assert.match(previewRuleCopyReply.content, /本次仅预览，未写入 KV。/);
    assert.deepEqual(previewRuleCopyBefore, previewRuleCopyAfter);

    const previewRuleRenameBefore = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    const previewRuleRenameReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewRuleRenameCommand,
    );
    const previewRuleRenameAfter = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    assert.equal(previewRuleRenameReply.type, 'text');
    assert.match(previewRuleRenameReply.content, /规则预览重命名（未写入）/);
    assert.match(previewRuleRenameReply.content, /- 原名称：weather-workflow/);
    assert.match(previewRuleRenameReply.content, /- 新名称：weather-workflow-preview-rename/);
    assert.match(previewRuleRenameReply.content, /- 步骤数：3/);
    assert.match(previewRuleRenameReply.content, /- 输出来源：finalText/);
    assert.match(previewRuleRenameReply.content, /本次仅预览，未写入 KV。/);
    assert.deepEqual(previewRuleRenameBefore, previewRuleRenameAfter);

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand('插件管理 预览复制 workflow missing-workflow weather-workflow-preview-copy'),
        ),
        /未找到 workflow 规则：missing-workflow/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand('插件管理 预览复制 workflow weather-workflow existing-workflow'),
        ),
        /规则名称已存在：existing-workflow/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand('插件管理 预览重命名 workflow missing-workflow weather-workflow-preview-rename'),
        ),
        /未找到 workflow 规则：missing-workflow/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand('插件管理 预览重命名 workflow weather-workflow existing-workflow'),
        ),
        /规则名称已存在：existing-workflow/,
    );

    const copyRuleReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 复制 workflow weather-workflow weather-workflow-copy'),
    );
    assert.equal(copyRuleReply.type, 'text');
    assert.match(copyRuleReply.content, /插件已复制成功/);

    const renameRuleReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 重命名 workflow weather-workflow-copy weather-workflow-archive'),
    );
    assert.equal(renameRuleReply.type, 'text');
    assert.match(renameRuleReply.content, /插件已重命名成功/);

    const previewDeleteWorkflowAliasCommand = parsePluginAdminCommand('插件管理 预览删除 workflow weather-workflow-archive');
    assert.equal(previewDeleteWorkflowAliasCommand.action, 'delete');
    assert.equal(previewDeleteWorkflowAliasCommand.category, 'workflow');
    assert.equal(previewDeleteWorkflowAliasCommand.name, 'weather-workflow-archive');
    assert.equal(previewDeleteWorkflowAliasCommand.confirmed, false);

    const previewDeleteWorkflowAliasBefore = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    const previewDeleteWorkflowAliasReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewDeleteWorkflowAliasCommand,
    );
    const previewDeleteWorkflowAliasAfter = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    assert.equal(previewDeleteWorkflowAliasReply.type, 'text');
    assert.match(previewDeleteWorkflowAliasReply.content, /规则预览删除（未写入）/);
    assert.match(previewDeleteWorkflowAliasReply.content, /- 步骤数：3/);
    assert.match(previewDeleteWorkflowAliasReply.content, /- 输出来源：finalText/);
    assert.match(previewDeleteWorkflowAliasReply.content, /确认删除 workflow weather-workflow-archive/);
    assert.deepEqual(previewDeleteWorkflowAliasBefore, previewDeleteWorkflowAliasAfter);

    const previewDeleteWorkflowBefore = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    const previewDeleteReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 删除 workflow weather-workflow-archive'),
    );
    const previewDeleteWorkflowAfter = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    assert.equal(previewDeleteReply.type, 'text');
    assert.match(previewDeleteReply.content, /规则预览删除（未写入）/);
    assert.match(previewDeleteReply.content, /确认删除 workflow weather-workflow-archive/);
    assert.deepEqual(previewDeleteWorkflowBefore, previewDeleteWorkflowAfter);

    const deleteReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 确认删除 workflow weather-workflow-archive'),
    );
    assert.equal(deleteReply.type, 'text');
    assert.match(deleteReply.content, /插件已删除/);

    const previewRollbackWorkflowBefore = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    const previewRollbackWorkflowReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        previewRollbackWorkflowCommand,
    );
    const previewRollbackWorkflowAfter = await readKvSnapshot(env, [WORKFLOW_LIVE_KEY, WORKFLOW_BACKUP_KEY]);
    assert.equal(previewRollbackWorkflowReply.type, 'text');
    assert.match(previewRollbackWorkflowReply.content, /规则预览回滚（未写入）/);
    assert.match(previewRollbackWorkflowReply.content, /- 分类：workflow/);
    assert.match(previewRollbackWorkflowReply.content, /恢复新增：weather-workflow-archive/);
    assert.match(previewRollbackWorkflowReply.content, /本次仅预览，未写入 KV。/);
    assert.match(previewRollbackWorkflowReply.content, /如确认执行，请发送：插件管理 回滚 workflow/);
    assert.deepEqual(previewRollbackWorkflowBefore, previewRollbackWorkflowAfter);

    assert.throws(
        () => parsePluginAdminCommand([
            '插件管理 详情 common existing-workflow',
            '步骤序号：1',
        ].join('\n')),
        /仅 workflow 详情支持按步骤查看/,
    );

    assert.throws(
        () => parsePluginAdminCommand([
            '插件管理 详情 workflow weather-workflow',
            '查看：unknown',
        ].join('\n')),
        /workflow 详情的“查看”仅支持：步骤JSON、规则JSON/,
    );

    assert.throws(
        () => parsePluginAdminCommand([
            '插件管理 详情 workflow weather-workflow',
            '查看：步骤JSON',
            '步骤名称：search',
        ].join('\n')),
        /查看“步骤JSON”时不能同时提供步骤序号或步骤名称/,
    );

    assert.throws(
        () => parsePluginAdminCommand([
            '插件管理 详情 workflow weather-workflow',
            '查看：规则JSON',
            '步骤序号：1',
        ].join('\n')),
        /查看“规则JSON”时不能同时提供步骤序号或步骤名称/,
    );

    assert.throws(
        () => parsePluginAdminCommand([
            '插件管理 详情 workflow weather-workflow',
            '查看：规则JSON',
            '步骤序号：1',
        ].join('\n')),
        /查看“规则JSON”时不能同时提供步骤序号或步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 预览添加 workflow',
                '名称：weather-workflow',
                '关键词：天气预览',
                '回复：text',
                '步骤：<<<',
                '[{"name":"search","url":"https://example.com/weather?q={{keyword}}","mode":"text","saveAs":"result"}]',
                '>>>',
                '输出来源：result',
            ].join('\n')),
        ),
        /规则名称已存在：weather-workflow/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 预览添加 workflow',
                '名称：bad-preview-add',
                '关键词：天气预览',
                '回复：text',
                '步骤：\[\]',
            ].join('\n')),
        ),
        /步骤必须是至少包含一个元素的 JSON 数组/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 预览修改 workflow weather-workflow',
                '步骤操作：删除',
                '步骤序号：1',
                '步骤名称：render-step',
            ].join('\n')),
        ),
        /步骤操作为删除时不能同时提供步骤序号和步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：复制',
                '步骤名称：render-step',
            ].join('\n')),
        ),
        /步骤操作为复制时必须提供目标步骤序号/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：复制',
                '步骤名称：render-step',
                '目标步骤序号：9',
            ].join('\n')),
        ),
        /目标步骤序号超出范围：当前共有 3 个步骤，可复制到 1-4/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：复制',
                '步骤名称：render-step',
                '目标步骤名称：render-copy',
                '目标步骤序号：2',
            ].join('\n')),
        ),
        /步骤操作为复制时不需要目标步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：复制',
                '步骤名称：missing-step',
                '目标步骤序号：2',
            ].join('\n')),
        ),
        /未找到步骤名称：missing-step/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：禁用',
                '步骤名称：render-copy',
                '步骤内容：<<<',
                '{"enabled":false}',
                '>>>',
            ].join('\n')),
        ),
        /步骤操作为禁用时不需要步骤内容/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：启用',
                '步骤名称：render-copy',
                '目标步骤序号：1',
            ].join('\n')),
        ),
        /步骤操作为启用时不需要目标步骤序号/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：禁用',
                '步骤名称：render-step',
            ].join('\n')),
        ),
        /outputFrom 未指向任何 saveAs 步骤：finalText/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：重命名',
                '步骤名称：render-step',
            ].join('\n')),
        ),
        /步骤操作为重命名时必须提供目标步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：重命名',
                '步骤名称：render-step',
                '目标步骤名称：render-renamed',
                '步骤内容：<<<',
                '{"name":"ignored"}',
                '>>>',
            ].join('\n')),
        ),
        /步骤操作为重命名时不需要步骤内容/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：重命名',
                '步骤名称：render-step',
                '目标步骤序号：1',
                '目标步骤名称：render-renamed',
            ].join('\n')),
        ),
        /步骤操作为重命名时不需要目标步骤序号/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：移动',
                '步骤名称：render-step',
            ].join('\n')),
        ),
        /步骤操作为移动时必须提供目标步骤序号/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：移动',
                '步骤名称：render-step',
                '目标步骤序号：9',
            ].join('\n')),
        ),
        /目标步骤序号超出范围：当前共有 3 个步骤，可移动到 1-3/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：移动',
                '步骤名称：render-step',
                '目标步骤序号：1',
                '步骤内容：<<<',
                '{"name":"ignored"}',
                '>>>',
            ].join('\n')),
        ),
        /步骤操作为移动时不需要步骤内容/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 详情 workflow weather-workflow',
                '步骤名称：missing-step',
            ].join('\n')),
        ),
        /未找到步骤名称：missing-step/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 详情 workflow weather-workflow',
                '步骤序号：1',
                '步骤名称：search',
            ].join('\n')),
        ),
        /查看步骤详情时不能同时提供步骤序号和步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：追加',
            ].join('\n')),
        ),
        /步骤操作为追加时必须提供步骤内容/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：修改',
                '步骤名称：missing-step',
                '步骤内容：<<<',
                '{"saveAs":"overflow"}',
                '>>>',
            ].join('\n')),
        ),
        /未找到步骤名称：missing-step/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：重命名',
                '步骤名称：missing-step',
                '目标步骤名称：still-missing',
            ].join('\n')),
        ),
        /未找到步骤名称：missing-step/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow weather-workflow',
                '步骤操作：删除',
                '步骤序号：1',
                '步骤名称：search',
            ].join('\n')),
        ),
        /步骤操作为删除时不能同时提供步骤序号和步骤名称/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow existing-workflow',
                '步骤操作：删除',
                '步骤序号：1',
            ].join('\n')),
        ),
        /workflow 至少需要保留一个步骤，不能删除最后一步/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 检查 workflow',
                '名称：bad-output',
                '关键词：天气',
                '回复：text',
                '步骤：<<<',
                '[{"name":"search","url":"https://example.com/weather","mode":"json","saveAs":"result"}]',
                '>>>',
                '输出来源：missing',
            ].join('\n')),
        ),
        /outputFrom 未指向任何 saveAs 步骤：missing/,
    );

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 检查 workflow',
                '名称：empty-steps',
                '关键词：天气',
                '回复：text',
                '步骤：[]',
            ].join('\n')),
        ),
        /步骤必须是至少包含一个元素的 JSON 数组/,
    );

    const rollbackReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 回滚 workflow'),
    );
    assert.equal(rollbackReply.type, 'text');
    assert.match(rollbackReply.content, /已完成回滚/);
    assert.match(rollbackReply.content, /恢复新增：weather-workflow-archive/);

    const restoredDetailReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand('插件管理 详情 workflow weather-workflow-archive'),
    );
    assert.equal(restoredDetailReply.type, 'text');
    assert.match(restoredDetailReply.content, /weather-workflow-archive/);

    const duplicateStepWorkflowAddReply = await service.handleCommand(
        createOwnerMessage(),
        env,
        parsePluginAdminCommand([
            '插件管理 添加 workflow',
            '名称：duplicate-step-workflow',
            '关键词：重复步骤',
            '回复：text',
            '步骤：<<<',
            '[{"name":"dup","url":"https://example.com/a","mode":"text","saveAs":"first"},{"name":"dup","url":"https://example.com/b","mode":"text","saveAs":"second"}]',
            '>>>',
            '输出来源：second',
        ].join('\n')),
    );
    assert.equal(duplicateStepWorkflowAddReply.type, 'text');
    assert.match(duplicateStepWorkflowAddReply.content, /duplicate-step-workflow/);

    await assert.rejects(
        () => service.handleCommand(
            createOwnerMessage(),
            env,
            parsePluginAdminCommand([
                '插件管理 修改 workflow duplicate-step-workflow',
                '步骤操作：复制',
                '步骤名称：dup',
                '目标步骤序号：2',
            ].join('\n')),
        ),
        /步骤名称不唯一：dup，请改用步骤序号/,
    );

    const runtimeEnv = {
        XBOT_KV: new MemoryKV({
            [WORKFLOW_LIVE_KEY]: JSON.stringify([
                {
                    name: 'runtime-workflow',
                    keyword: 'runtime-test',
                    mode: 'workflow',
                    rType: 'text',
                    steps: [
                        {
                            name: 'disabled-step',
                            enabled: false,
                            url: 'https://example.com/disabled',
                            mode: 'text',
                            saveAs: 'disabled',
                        },
                        {
                            name: 'enabled-step',
                            url: 'https://example.com/enabled',
                            mode: 'text',
                            saveAs: 'enabled',
                        },
                    ],
                    outputFrom: 'enabled',
                },
            ], null, 4),
        }),
        XBOT_DB: {},
        BOT_OWNER_WECHAT_ID: 'owner-wechat-id',
        COMMON_PLUGINS_CACHE_MS: '0',
    };
    const originalFetch = global.fetch;
    const fetchedUrls = [];
    global.fetch = async (url) => {
        fetchedUrls.push(String(url));
        return new Response('enabled-result', {status: 200});
    };
    try {
        const runtimeReply = await workflowCommonPluginsEngine.handle(
            createOwnerMessage('runtime-test'),
            runtimeEnv,
        );
        assert.ok(runtimeReply);
        assert.equal(runtimeReply.type, 'text');
        assert.equal(runtimeReply.content, 'enabled-result');
        assert.deepEqual(fetchedUrls, ['https://example.com/enabled']);
    } finally {
        global.fetch = originalFetch;
    }

    console.log('plugin-admin smoke ok (common/dynamic/workflow)');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
});

