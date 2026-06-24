const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const compiledRoot = path.join(repoRoot, '.tmp-plugin-admin-smoke');

function resolveCompiledModule(relativePath) {
    const dirname = relativePath.endsWith('.js')
        ? relativePath.slice(0, -3)
        : relativePath;
    const candidates = [
        path.join(compiledRoot, relativePath),
        path.join(compiledRoot, dirname, 'index.js'),
        path.join(compiledRoot, 'src', relativePath),
        path.join(compiledRoot, 'src', dirname, 'index.js'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Cannot find compiled module: ${relativePath}`);
}

const {parsePluginAdminCommand, pluginAdminPlugin} = require(resolveCompiledModule(path.join('plugins', 'system', 'plugin-admin', 'plugin.js')));
const {PluginAdminService} = require(resolveCompiledModule(path.join('plugins', 'system', 'plugin-admin', 'plugin-admin-service.js')));
const {dynamicRulesEngine} = require(resolveCompiledModule(path.join('plugins', 'rule-engine', 'dynamic.js')));

const COMMON_LIVE_KEY = 'plugins:common:mapping';
const DYNAMIC_LIVE_KEY = 'plugins:parameterized:mapping';
const COMMON_BACKUP_KEY = 'plugins:common:mapping:backup';
const DYNAMIC_BACKUP_KEY = 'plugins:parameterized:mapping:backup';
const BOM = '\uFEFF';

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
    const options = optionsOrWorkflowRules;
    const {
        commonRules = [],
        dynamicRules = [],
        overrides = {},
    } = options;

    return {
        XBOT_KV: new MemoryKV({
            [COMMON_LIVE_KEY]: JSON.stringify(commonRules, null, 4),
            [DYNAMIC_LIVE_KEY]: JSON.stringify(dynamicRules, null, 4),
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
    assert.match(helpReply.content, /五、说明/);
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

    const largeListEnv = createEnv({
        commonRules: Array.from({length: 13}, (_, index) => ({
            name: `bulk-common-${index + 1}`,
            keyword: `批量关键词${index + 1}`,
            url: `https://example.com/bulk/${index + 1}`,
            mode: 'text',
            rType: 'text',
        })),
    });
    const largeListReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 列表 common'),
        largeListEnv,
    );
    assert.ok(largeListReply);
    assert.equal(largeListReply.type, 'app');
    assert.match(largeListReply.appXml, /当前 common 分类规则：13 条/);
    assert.match(largeListReply.appXml, /bulk-common-1/);
    assert.match(largeListReply.appXml, /bulk-common-13/);
    assert.doesNotMatch(largeListReply.appXml, /还有 1 条未展示/);

    const commonSearchReply = await service.handleCommand(
        createOwnerMessage(),
        commonEnv,
        parsePluginAdminCommand('插件管理 搜索 common hello'),
    );
    assert.equal(commonSearchReply.type, 'text');
    assert.match(commonSearchReply.content, /搜索结果：common \/ hello/);
    assert.match(commonSearchReply.content, /hello-common/);

    const largeSearchEnv = createEnv({
        commonRules: Array.from({length: 21}, (_, index) => ({
            name: `weather-bulk-${index + 1}`,
            keyword: `weather-keyword-${index + 1}`,
            url: `https://example.com/weather/${index + 1}`,
            mode: 'text',
            rType: 'text',
        })),
    });
    const largeSearchReply = await pluginAdminPlugin.handle(
        createOwnerMessage('插件管理 搜索 common weather'),
        largeSearchEnv,
    );
    assert.ok(largeSearchReply);
    assert.equal(largeSearchReply.type, 'app');
    assert.match(largeSearchReply.appXml, /搜索结果：common \/ weather （共 21 条）/);
    assert.match(largeSearchReply.appXml, /weather-bulk-1/);
    assert.match(largeSearchReply.appXml, /weather-bulk-21/);
    assert.doesNotMatch(largeSearchReply.appXml, /仅展示前/);

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
    assert.match(previewCopyCommonReply.content, /本次仅预览，还没保存。/);
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
    assert.match(previewRenameCommonReply.content, /本次仅预览，还没保存。/);
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
    assert.match(previewRollbackCommonReply.content, /本次仅预览，还没保存。/);
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

    const keywordMappingDynamicEnv = createEnv();
    await keywordMappingDynamicEnv.XBOT_KV.put(DYNAMIC_LIVE_KEY, JSON.stringify({
        keywordMapping: [
            {
                name: 'wrapped-dynamic',
                keyword: 'wrapped',
                matchMode: 'prefix',
                args: {
                    mode: 'tail',
                    names: ['query'],
                    required: ['query'],
                },
                url: 'https://example.com/wrapped?q={{query}}',
                mode: 'text',
                rType: 'text',
            },
        ],
    }, null, 4));
    const wrappedDynamicListReply = await service.handleCommand(
        createOwnerMessage(),
        keywordMappingDynamicEnv,
        parsePluginAdminCommand('插件管理 列表 dynamic'),
    );
    assert.equal(wrappedDynamicListReply.type, 'text');
    assert.match(wrappedDynamicListReply.content, /wrapped-dynamic/);

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
    assert.match(inlineCommonListReply.content, /警告：当前 common 规则由环境变量内联配置接管/);
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
        /当前 common 规则由环境变量内联配置接管，聊天命令修改存储不会生效/,
    );

    const dynamicRuntimeEnv = {
        XBOT_KV: new MemoryKV({
            [DYNAMIC_LIVE_KEY]: `${BOM}${JSON.stringify([
                {
                    name: 'proxy-api-debug-text',
                    matchMode: 'regex',
                    pattern: '^(?:接口调试|代理调试|debug-url)\\s+(https?:\\/\\/\\S+)$',
                    args: {
                        mode: 'regex',
                        names: ['targetUrl'],
                        required: ['targetUrl'],
                    },
                    url: 'https://lwcfworker.dpdns.org/proxy?url={{targetUrl}}',
                    method: 'GET',
                    mode: 'text',
                    rType: 'text',
                },
                {
                    name: 'proxy-api-debug-link',
                    matchMode: 'regex',
                    pattern: '^(?:接口调试链接|代理调试链接|debug-link)\\s+(https?:\\/\\/\\S+)$',
                    args: {
                        mode: 'regex',
                        names: ['targetUrl'],
                        required: ['targetUrl'],
                    },
                    url: 'https://lwcfworker.dpdns.org/proxy?url={{targetUrl}}',
                    method: 'GET',
                    mode: 'base64',
                    rType: 'link',
                    linkTitle: '接口代理调试',
                    linkDescription: '点击打开代理后的调试链接',
                },
                {
                    name: 'proxy-api-debug-post-text',
                    matchMode: 'regex',
                    pattern: '^(?:接口调试POST|代理调试POST|debug-post)\\s+(https?:\\/\\/\\S+)\\s*\\n([\\s\\S]+)$',
                    args: {
                        mode: 'regex',
                        names: ['targetUrl', 'body'],
                        required: ['targetUrl', 'body'],
                    },
                    url: 'https://lwcfworker.dpdns.org/proxy?url={{targetUrl}}',
                    method: 'POST',
                    body: '{{body}}',
                    mode: 'text',
                    rType: 'text',
                },
            ], null, 4)}`,
        }),
        XBOT_DB: {},
        BOT_OWNER_WECHAT_ID: 'owner-wechat-id',
        COMMON_PLUGINS_CACHE_MS: '0',
    };
    const originalDynamicFetch = global.fetch;
    const dynamicFetchCalls = [];
    global.fetch = async (url, init = {}) => {
        dynamicFetchCalls.push({
            url: String(url),
            method: init.method ?? 'GET',
            headers: init.headers,
            body: init.body,
        });
        return new Response('{"ok":true,"source":"proxy"}', {status: 200});
    };
    try {
        const debugTargetUrl = 'https://api.example.com/search?q=chat-bot&lang=zh-CN#section';
        const runtimeReply = await dynamicRulesEngine.handle(
            createOwnerMessage(`接口调试 ${debugTargetUrl}`),
            dynamicRuntimeEnv,
        );
        assert.ok(runtimeReply);
        assert.equal(runtimeReply.type, 'text');
        assert.equal(runtimeReply.content, '{"ok":true,"source":"proxy"}');
        assert.deepEqual(dynamicFetchCalls, [
            {
                url: 'https://lwcfworker.dpdns.org/proxy?url=https%3A%2F%2Fapi.example.com%2Fsearch%3Fq%3Dchat-bot%26lang%3Dzh-CN%23section',
                method: 'GET',
                headers: undefined,
                body: undefined,
            },
        ]);

        const linkReply = await dynamicRulesEngine.handle(
            createOwnerMessage(`debug-link ${debugTargetUrl}`),
            dynamicRuntimeEnv,
        );
        assert.ok(linkReply);
        assert.equal(linkReply.type, 'news');
        assert.equal(linkReply.articles.length, 1);
        assert.equal(linkReply.articles[0].title, '接口代理调试');
        assert.equal(linkReply.articles[0].description, '点击打开代理后的调试链接');
        assert.equal(
            linkReply.articles[0].url,
            'https://lwcfworker.dpdns.org/proxy?url=https%3A%2F%2Fapi.example.com%2Fsearch%3Fq%3Dchat-bot%26lang%3Dzh-CN%23section',
        );
        assert.deepEqual(dynamicFetchCalls, [
            {
                url: 'https://lwcfworker.dpdns.org/proxy?url=https%3A%2F%2Fapi.example.com%2Fsearch%3Fq%3Dchat-bot%26lang%3Dzh-CN%23section',
                method: 'GET',
                headers: undefined,
                body: undefined,
            },
        ]);

        const postBody = '{"from":"xchatbot","debug":true}';
        const postReply = await dynamicRulesEngine.handle(
            createOwnerMessage(`debug-post ${debugTargetUrl}\n${postBody}`),
            dynamicRuntimeEnv,
        );
        assert.ok(postReply);
        assert.equal(postReply.type, 'text');
        assert.equal(postReply.content, '{"ok":true,"source":"proxy"}');
        assert.equal(dynamicFetchCalls.length, 2);
        assert.deepEqual(dynamicFetchCalls[1], {
            url: 'https://lwcfworker.dpdns.org/proxy?url=https%3A%2F%2Fapi.example.com%2Fsearch%3Fq%3Dchat-bot%26lang%3Dzh-CN%23section',
            method: 'POST',
            headers: {},
            body: postBody,
        });

        const rejectedReply = await dynamicRulesEngine.handle(
            createOwnerMessage('接口调试 ftp://example.com/file.txt'),
            dynamicRuntimeEnv,
        );
        assert.equal(rejectedReply, null);

        const rejectedLinkReply = await dynamicRulesEngine.handle(
            createOwnerMessage('debug-link ftp://example.com/file.txt'),
            dynamicRuntimeEnv,
        );
        assert.equal(rejectedLinkReply, null);

        const rejectedPostReply = await dynamicRulesEngine.handle(
            createOwnerMessage('debug-post ftp://example.com/file.txt\n{"bad":true}'),
            dynamicRuntimeEnv,
        );
        assert.equal(rejectedPostReply, null);

        const missingBodyPostReply = await dynamicRulesEngine.handle(
            createOwnerMessage(`debug-post ${debugTargetUrl}`),
            dynamicRuntimeEnv,
        );
        assert.equal(missingBodyPostReply, null);
    } finally {
        global.fetch = originalDynamicFetch;
    }

    console.log('plugin-admin smoke ok (rule-engine categories: common/dynamic)');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
});

