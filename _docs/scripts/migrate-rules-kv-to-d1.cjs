const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {
    convertKvRulesToDefinitions,
    buildMigrationSql,
} = require('./lib/rule-kv-to-d1-convert.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, '_docs', 'rules', 'rule-definition.sql');
const COMMON_KV_KEY = 'plugins:common:mapping';
const DYNAMIC_KV_KEY = 'plugins:parameterized:mapping';
const MIGRATION_MARKER_KEY = 'rule-engine:d1:migrated';
const D1_DATABASE = 'xbotdata';
const KV_BINDING = 'XBOT_KV';

function printUsage() {
    console.log(`用法：
  node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote
  node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope local
  node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote --dry-run
  node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote --common-file ./common.json --dynamic-file ./dynamic.json

选项：
  --scope local|remote     目标 D1 / KV（默认 remote）
  --dry-run                只生成 SQL，不写入 D1
  --common-file <path>     从本地 JSON 读取 common 规则（默认 wrangler 读 KV）
  --dynamic-file <path>    从本地 JSON 读取 dynamic 规则（默认 wrangler 读 KV）
  --keep-marker            不写入 rule-engine:d1:migrated 标记
  --sql-out <path>         额外保存生成的 SQL 文件`);
}

function parseArgs(argv) {
    const options = {
        scope: 'remote',
        dryRun: false,
        keepMarker: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            options.help = true;
            continue;
        }
        if (token === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (token === '--keep-marker') {
            options.keepMarker = true;
            continue;
        }
        if (!token.startsWith('--')) {
            throw new Error(`未知参数：${token}`);
        }
        const key = token.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`参数缺少值：--${key}`);
        }
        options[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
        index += 1;
    }

    if (options.scope !== 'local' && options.scope !== 'remote') {
        throw new Error(`--scope 仅支持 local / remote，收到：${options.scope}`);
    }
    return options;
}

function quoteShellArg(value) {
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
    return `"${String(value).replace(/"/g, '""')}"`;
}

function runWrangler(args, output = 'utf8') {
    const command = ['npx', 'wrangler', ...args].map(quoteShellArg).join(' ');
    const result = process.platform === 'win32'
        ? spawnSync(command, [], {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: output,
        })
        : spawnSync('npx', ['wrangler', ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: output,
        });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error([result.stderr?.trim(), result.stdout?.trim(), `wrangler 执行失败：${args.join(' ')}`]
            .filter(Boolean)
            .join('\n'));
    }
    return result.stdout ?? '';
}

function getScopeFlag(scope) {
    return scope === 'local' ? '--local' : '--remote';
}

function readKvText(key, scope) {
    return runWrangler([
        'kv', 'key', 'get',
        '--binding', KV_BINDING,
        key,
        getScopeFlag(scope),
        '--text',
    ]).trim();
}

function readRuleSource(filePath, key, scope) {
    if (filePath) {
        return fs.readFileSync(path.resolve(filePath), 'utf8');
    }
    return readKvText(key, scope);
}

function writeMigrationMarker(scope) {
    runWrangler([
        'kv', 'key', 'put',
        '--binding', KV_BINDING,
        MIGRATION_MARKER_KEY,
        String(Date.now()),
        getScopeFlag(scope),
    ]);
}

function executeSqlFile(sqlFile, scope) {
    runWrangler([
        'd1', 'execute', D1_DATABASE,
        getScopeFlag(scope),
        '--file', sqlFile,
    ]);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    const commonRaw = readRuleSource(options.commonFile, COMMON_KV_KEY, options.scope);
    const dynamicRaw = readRuleSource(options.dynamicFile, DYNAMIC_KV_KEY, options.scope);
    const {common, dynamic, all} = convertKvRulesToDefinitions(commonRaw, dynamicRaw);

    if (all.length === 0) {
        throw new Error('没有可迁移的规则：common / dynamic KV 都为空或解析后无有效条目');
    }

    const sql = buildMigrationSql(all, {includeSchema: true, schemaSql});
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xchatbot-rules-migrate-'));
    const sqlFile = path.resolve(options.sqlOut ?? path.join(tempDir, 'rule-definition-data.sql'));
    fs.writeFileSync(sqlFile, sql, 'utf8');

    console.log(`准备迁移：common ${common.length} 条，dynamic ${dynamic.length} 条，合计 ${all.length} 条`);
    console.log(`SQL 文件：${sqlFile}`);

    if (options.dryRun) {
        console.log('dry-run 模式：未写入 D1 / KV');
        return;
    }

    executeSqlFile(sqlFile, options.scope);
    if (!options.keepMarker) {
        writeMigrationMarker(options.scope);
    }

    console.log(`迁移完成（scope=${options.scope}）`);
    if (!options.keepMarker) {
        console.log(`已写入 KV 标记：${MIGRATION_MARKER_KEY}`);
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
