const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const configRoot = path.join(projectRoot, '.config');
const legacyConfigRoot = path.join(projectRoot, '.local-config');

const mappings = [
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'common', 'common-plugins.json'),
        target: path.join(configRoot, 'common', 'common-plugins.json'),
        description: '通用插件基础规则',
    },
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'common', 'common-plugins-dynamic.json'),
        target: path.join(configRoot, 'common', 'common-plugins-dynamic.json'),
        description: '通用插件动态规则',
    },
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'common', 'common-plugins-workflow.json'),
        target: path.join(configRoot, 'common', 'common-plugins-workflow.json'),
        description: '通用插件工作流规则',
    },
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'ai', 'ai-dialog-config.sample.json'),
        target: path.join(configRoot, 'ai', 'ai-dialog-config.json'),
        description: 'AI 对话配置',
    },
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'ai', 'mimo-tts-config.sample.json'),
        target: path.join(configRoot, 'ai', 'mimo-tts-config.json'),
        description: '聪明唱歌 / MiMo TTS 配置',
    },
    {
        sample: path.join(projectRoot, '_docs', 'templates', 'xiuxian', 'xiuxian-set-config.sample.json'),
        target: path.join(configRoot, 'xiuxian', 'xiuxian-set-config.json'),
        description: '修仙装备套装配置',
    },
];

const quiet = process.argv.includes('--quiet');

function log(message) {
    if (!quiet) {
        console.log(message);
    }
}

function isDirectoryEmpty(dirPath) {
    return fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0;
}

function mergeLegacyDirectory(sourceDir, targetDir) {
    let migratedCount = 0;
    let skippedCount = 0;

    fs.mkdirSync(targetDir, {recursive: true});

    for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            const result = mergeLegacyDirectory(sourcePath, targetPath);
            migratedCount += result.migratedCount;
            skippedCount += result.skippedCount;
            if (isDirectoryEmpty(sourcePath)) {
                fs.rmSync(sourcePath, {recursive: true, force: true});
            }
            continue;
        }

        fs.mkdirSync(path.dirname(targetPath), {recursive: true});
        if (fs.existsSync(targetPath)) {
            skippedCount += 1;
            log(`迁移跳过：${path.relative(projectRoot, sourcePath)} -> ${path.relative(projectRoot, targetPath)}（目标已存在）`);
            continue;
        }

        fs.renameSync(sourcePath, targetPath);
        migratedCount += 1;
        log(`已迁移：${path.relative(projectRoot, sourcePath)} -> ${path.relative(projectRoot, targetPath)}`);
    }

    return {migratedCount, skippedCount};
}

function migrateLegacyConfigDir() {
    if (!fs.existsSync(legacyConfigRoot)) {
        return {migratedCount: 0, skippedCount: 0};
    }

    if (!fs.existsSync(configRoot)) {
        fs.renameSync(legacyConfigRoot, configRoot);
        log(`已迁移配置目录：${path.relative(projectRoot, legacyConfigRoot)} -> ${path.relative(projectRoot, configRoot)}`);
        return {migratedCount: 1, skippedCount: 0};
    }

    const result = mergeLegacyDirectory(legacyConfigRoot, configRoot);
    if (isDirectoryEmpty(legacyConfigRoot)) {
        fs.rmSync(legacyConfigRoot, {recursive: true, force: true});
        log(`已清理旧目录：${path.relative(projectRoot, legacyConfigRoot)}`);
    } else {
        log(`旧目录仍保留：${path.relative(projectRoot, legacyConfigRoot)}（存在未迁移文件，请手动确认）`);
    }
    return result;
}

const migrationResult = migrateLegacyConfigDir();

fs.mkdirSync(configRoot, {recursive: true});

let createdCount = 0;
let skippedCount = 0;

for (const item of mappings) {
    if (!fs.existsSync(item.sample)) {
        throw new Error(`样例文件不存在：${item.sample}`);
    }
    fs.mkdirSync(path.dirname(item.target), {recursive: true});
    if (fs.existsSync(item.target)) {
        skippedCount += 1;
        log(`已存在，跳过：${path.relative(projectRoot, item.target)}（${item.description}）`);
        continue;
    }
    fs.copyFileSync(item.sample, item.target);
    createdCount += 1;
    log(`已创建：${path.relative(projectRoot, item.target)}（${item.description}）`);
}

log('');
log(`配置目录：${path.relative(projectRoot, configRoot)}`);
log(`迁移 ${migrationResult.migratedCount} 项，迁移跳过 ${migrationResult.skippedCount} 项。`);
log(`新建 ${createdCount} 个，跳过 ${skippedCount} 个。`);

