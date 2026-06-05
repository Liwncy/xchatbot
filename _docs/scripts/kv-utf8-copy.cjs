const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let i = 0; i < rest.length; i += 1) {
        const token = rest[i];
        if (!token.startsWith('--')) {
            throw new Error(`未知参数：${token}`);
        }
        const key = token.slice(2);
        const value = rest[i + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`参数缺少值：--${key}`);
        }
        options[key] = value;
        i += 1;
    }
    return {command, options};
}

function quoteShellArg(value) {
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
    return `"${String(value).replace(/"/g, '""')}"`;
}

function runWrangler(args, output = 'buffer') {
    const command = ['npx', 'wrangler', ...args].map(quoteShellArg).join(' ');
    const result = process.platform === 'win32'
        ? spawnSync(command, [], {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: output === 'utf8' ? 'utf8' : 'buffer',
        })
        : spawnSync('npx', ['wrangler', ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: output === 'utf8' ? 'utf8' : 'buffer',
        });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        const stderr = output === 'utf8'
            ? result.stderr
            : Buffer.isBuffer(result.stderr)
                ? result.stderr.toString('utf8')
                : String(result.stderr ?? '');
        const stdout = output === 'utf8'
            ? result.stdout
            : Buffer.isBuffer(result.stdout)
                ? result.stdout.toString('utf8')
                : String(result.stdout ?? '');
        throw new Error([stderr.trim(), stdout.trim(), `wrangler 执行失败：${args.join(' ')}`].filter(Boolean).join('\n'));
    }

    return result.stdout;
}

function getScopeFlag(scope) {
    if (scope === 'local') return '--local';
    if (scope === 'remote') return '--remote';
    throw new Error(`scope 仅支持 local/remote，收到：${scope}`);
}

function readValue({binding, key, scope}) {
    return runWrangler([
        'kv', 'key', 'get',
        '--binding', binding,
        key,
        getScopeFlag(scope),
        '--text',
    ]);
}

function writeValue({binding, key, scope, value}) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xchatbot-kv-'));
    const tempFile = path.join(tempDir, 'value.txt');
    try {
        fs.writeFileSync(tempFile, value);
        runWrangler([
            'kv', 'key', 'put',
            '--binding', binding,
            key,
            '--path', tempFile,
            getScopeFlag(scope),
        ], 'utf8');
    } finally {
        fs.rmSync(tempDir, {recursive: true, force: true});
    }
}

function requireOption(options, key) {
    const value = options[key];
    if (!value) {
        throw new Error(`缺少参数：--${key}`);
    }
    return value;
}

function main() {
    const {command, options} = parseArgs(process.argv.slice(2));

    if (command === 'copy') {
        const binding = requireOption(options, 'binding');
        const key = requireOption(options, 'key');
        const from = requireOption(options, 'from');
        const to = requireOption(options, 'to');
        const value = readValue({binding, key, scope: from});
        writeValue({binding, key, scope: to, value});
        return;
    }

    if (command === 'export') {
        const binding = requireOption(options, 'binding');
        const key = requireOption(options, 'key');
        const from = requireOption(options, 'from');
        const out = requireOption(options, 'out');
        const value = readValue({binding, key, scope: from});
        fs.mkdirSync(path.dirname(out), {recursive: true});
        fs.writeFileSync(out, value);
        return;
    }

    throw new Error(`不支持的命令：${command}`);
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}



