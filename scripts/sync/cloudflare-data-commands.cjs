const {spawnSync} = require('node:child_process');

const groups = [
    {
        title: 'A. 常用入口',
        commands: [
            {id: 'dev:pull', description: '先拉远端 KV / D1 到本地，再启动本地开发。', steps: ['sync:pull']},
            {id: 'deploy:safe', description: '先拉远端数据，再类型检查，再部署。', shell: 'npm run typecheck && npm run deploy', steps: ['sync:pull']},
            {id: 'deploy:safe:push', description: '先把本地 KV / D1 推到远端，再类型检查，再部署。', shell: 'npm run typecheck && npm run deploy', steps: ['sync:push:force']},
        ],
    },
    {
        title: 'B. D1 命令',
        commands: [
            {id: 'd1:migrate:local:roleplay', description: '初始化本地演法角色表并灌入目录。', shell: 'wrangler d1 execute xbotdata --local --file "./.docs/sql/roleplay-character.sql"'},
            {id: 'd1:migrate:remote:roleplay', description: '初始化远端演法角色表并灌入目录。', shell: 'wrangler d1 execute xbotdata --remote --file "./.docs/sql/roleplay-character.sql"'},
            {id: 'roleplay:from-mysql', description: '从 one-agbot MySQL 种子生成 D1 演法目录 SQL。', shell: 'node ./scripts/sync/roleplay-from-mysql.cjs'},
            {id: 'd1:tables:local', description: '查看本地 D1 表列表。', shell: 'wrangler d1 execute xbotdata --local --command "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name;"'},
            {id: 'd1:tables:remote', description: '查看远端 D1 表列表。', shell: 'wrangler d1 execute xbotdata --remote --command "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name;"'},
        ],
    },
    {
        title: 'C. 数据同步与回滚',
        commands: [
            {id: 'sync:pull', description: '远端 -> 本地，一次同步 KV + D1，推荐日常使用。', steps: ['sync:d1:remote-to-local', 'sync:kv:remote-to-local']},
            {id: 'sync:push', description: '本地 -> 远端，默认带确认，并先备份远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-push-safe.ps1'},
            {id: 'sync:push:force', description: '无交互强制推送，适合脚本 / CI。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-push-safe.ps1 -Force'},
            {id: 'sync:rollback:last', description: '回滚最近一次 push 生成的远端备份。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-rollback-last-push.ps1'},
            {id: 'sync:rollback:last:force', description: '无交互强制回滚。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-rollback-last-push.ps1 -Force'},
            {id: 'sync:d1:remote-to-local', description: '只同步远端 D1 到本地。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-d1-remote-to-local.ps1'},
            {id: 'sync:kv:remote-to-local', description: '只同步远端 KV 到本地。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-kv-remote-to-local.ps1'},
            {id: 'sync:d1:local-to-remote', description: '只同步本地 D1 到远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-d1-local-to-remote.ps1'},
            {id: 'sync:kv:local-to-remote', description: '只同步本地 KV 到远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/sync/sync-kv-local-to-remote.ps1'},
            {id: 'kv:list:remote', description: '列出远端 KV key。', shell: 'wrangler kv key list --binding XBOT_KV --remote'},
        ],
    },
];

const commandMap = new Map();
for (const group of groups) {
    for (const command of group.commands) {
        command.group = group.title;
        commandMap.set(command.id, command);
    }
}

function printHeader() {
    console.log('xchatbot Cloudflare 数据命令速查');
    console.log('================================');
    console.log('');
    console.log('说明：');
    console.log('- 这些命令默认在项目根目录执行。');
    console.log('- D1 同步会先清空目标端业务表再导入，避免 table already exists 一类冲突。');
    console.log('- 同步日志写入 .tmp/sync-logs/，同步备份写入 .tmp/sync-backups/。');
    console.log('- sync:rollback:last 依赖最近一次 sync:push 生成的同批次备份（含 manifest.json）。');
    console.log('');
}

function printList() {
    printHeader();
    for (const group of groups) {
        console.log(group.title);
        console.log('-'.repeat(group.title.length));
        for (const command of group.commands) {
            console.log(`- ${command.id}`);
            console.log(`  ${command.description}`);
        }
        console.log('');
    }
}

function printShow(id) {
    const command = commandMap.get(id);
    if (!command) {
        console.error(`未找到命令：${id}`);
        process.exit(1);
    }
    console.log(`${command.id}`);
    console.log('-'.repeat(command.id.length));
    console.log(`分组：${command.group}`);
    console.log(`说明：${command.description}`);
    if (command.steps?.length) {
        console.log('步骤：');
        for (const step of command.steps) {
            console.log(`- ${step}`);
        }
    }
    if (command.shell) {
        console.log('执行内容：');
        console.log(command.shell);
    }
}

function runShell(command) {
    const result = spawnSync(command, {
        shell: true,
        stdio: 'inherit',
    });
    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status);
    }
    if (result.error) {
        throw result.error;
    }
}

function runCommand(id) {
    const command = commandMap.get(id);
    if (!command) {
        console.error(`未找到命令：${id}`);
        process.exit(1);
    }
    console.log(`执行：${command.id}`);
    console.log(`说明：${command.description}`);
    if (command.steps?.length) {
        for (const step of command.steps) {
            runCommand(step);
        }
    }
    if (command.shell) {
        runShell(command.shell);
    }
}

const [action = 'list', id] = process.argv.slice(2);

if (action === 'list') {
    printList();
} else if (action === 'show') {
    if (!id) {
        console.error('用法：node ./scripts/sync/cloudflare-data-commands.cjs show <命令名>');
        process.exit(1);
    }
    printShow(id);
} else if (action === 'run') {
    if (!id) {
        console.error('用法：node ./scripts/sync/cloudflare-data-commands.cjs run <命令名>');
        process.exit(1);
    }
    runCommand(id);
} else {
    console.error(`不支持的操作：${action}`);
    console.error('可用操作：list / show / run');
    process.exit(1);
}

