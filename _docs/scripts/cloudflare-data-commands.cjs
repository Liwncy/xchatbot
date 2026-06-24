const {spawnSync} = require('node:child_process');

const CONFIG_ROOT = './.config';

const groups = [
    {
        title: 'A. 常用入口',
        commands: [
            {id: 'config:init', description: '从仓库样例复制一份本地专用配置到 .config/，如存在 .local-config/ 会自动迁移。', shell: 'node ./_docs/scripts/init-local-configs.cjs'},
            {id: 'dev:pull', description: '先拉远端 KV / D1 到本地，再启动本地开发。', steps: ['sync:pull']},
            {id: 'dev:seed', description: '先把内置规则样例写入本地 KV，再启动本地开发。', steps: ['kv:seed:local']},
            {id: 'deploy:safe', description: '先拉远端数据，再类型检查，再部署。', shell: 'npm run typecheck && npm run deploy', steps: ['sync:pull']},
            {id: 'deploy:safe:push', description: '先把本地 KV / D1 推到远端，再类型检查，再部署。', shell: 'npm run typecheck && npm run deploy', steps: ['sync:push:force']},
        ],
    },
    {
        title: 'B. D1 命令',
        commands: [
            {id: 'd1:migrate:local', description: '初始化本地修仙玩法表。', shell: 'wrangler d1 execute xbotdata --local --file "./_docs/xiuxian/xiuxian-mvp.sql"'},
            {id: 'd1:migrate:remote', description: '初始化远端修仙玩法表。', shell: 'wrangler d1 execute xbotdata --remote --file "./_docs/xiuxian/xiuxian-mvp.sql"'},
            {id: 'd1:migrate:local:scheduler', description: '初始化本地调度中心表。', shell: 'wrangler d1 execute xbotdata --local --file "./_docs/scheduler/scheduler-mvp.sql"'},
            {id: 'd1:migrate:remote:scheduler', description: '初始化远端调度中心表。', shell: 'wrangler d1 execute xbotdata --remote --file "./_docs/scheduler/scheduler-mvp.sql"'},
            {id: 'd1:tables:local', description: '查看本地 D1 表列表。', shell: 'wrangler d1 execute xbotdata --local --command "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name;"'},
            {id: 'd1:tables:remote', description: '查看远端 D1 表列表。', shell: 'wrangler d1 execute xbotdata --remote --command "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name;"'},
            {id: 'rules:migrate:local', description: '从本地 KV 迁移规则到本地 D1（生成 SQL 并 wrangler 执行）。', shell: 'node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope local'},
            {id: 'rules:migrate:remote', description: '从远端 KV 迁移规则到远端 D1（生成 SQL 并 wrangler 执行）。', shell: 'node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote'},
            {id: 'rules:migrate:dry-run', description: '预览 KV→D1 迁移 SQL，不写入。', shell: 'node ./_docs/scripts/migrate-rules-kv-to-d1.cjs --scope remote --dry-run'},
        ],
    },
    {
        title: 'C. 规则引擎 KV',
        commands: [
            {id: 'kv:seed:local', description: '一次性写入本地 common / dynamic 两类规则配置（读取 .config/common/）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:common:mapping" --path "${CONFIG_ROOT}/plugin-config/common-plugins.json" --local && wrangler kv key put --binding XBOT_KV "plugins:parameterized:mapping" --path "${CONFIG_ROOT}/plugin-config/common-plugins-dynamic.json" --local`},
            {id: 'kv:seed:remote', description: '一次性写入远端 common / dynamic 两类规则配置（读取 .config/common/）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:common:mapping" --path "${CONFIG_ROOT}/plugin-config/common-plugins.json" --remote && wrangler kv key put --binding XBOT_KV "plugins:parameterized:mapping" --path "${CONFIG_ROOT}/plugin-config/common-plugins-dynamic.json" --remote`},
            {id: 'kv:get:local:common', description: '读取本地 common 规则配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:common:mapping" --local'},
            {id: 'kv:get:local:dynamic', description: '读取本地 dynamic 规则配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:parameterized:mapping" --local'},
            {id: 'kv:get:remote:common', description: '读取远端 common 规则配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:common:mapping" --remote'},
            {id: 'kv:get:remote:dynamic', description: '读取远端 dynamic 规则配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:parameterized:mapping" --remote'},
            {id: 'kv:list:remote', description: '列出远端 KV key，适合排查 key 是否存在。', shell: 'wrangler kv key list --binding XBOT_KV --remote'},
        ],
    },
    {
        title: 'D. 业务配置 KV',
        commands: [
            {id: 'kv:set:local:ai-dialog-config', description: '写入本地 AI 对话配置（读取 .config/ai/ai-dialog-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:ai-dialog:config" --path "${CONFIG_ROOT}/ai/ai-dialog-config.json" --local`},
            {id: 'kv:get:local:ai-dialog-config', description: '读取本地 AI 对话配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:ai-dialog:config" --local'},
            {id: 'kv:set:remote:ai-dialog-config', description: '写入远端 AI 对话配置（读取 .config/ai/ai-dialog-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:ai-dialog:config" --path "${CONFIG_ROOT}/ai/ai-dialog-config.json" --remote`},
            {id: 'kv:get:remote:ai-dialog-config', description: '读取远端 AI 对话配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:ai-dialog:config" --remote'},
            {id: 'kv:set:local:ai-sing-config', description: '写入本地聪明唱歌 / MiMo TTS 配置（读取 .config/ai/mimo-tts-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:ai-sing:config" --path "${CONFIG_ROOT}/ai/mimo-tts-config.json" --local`},
            {id: 'kv:get:local:ai-sing-config', description: '读取本地聪明唱歌 / MiMo TTS 配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:ai-sing:config" --local'},
            {id: 'kv:set:remote:ai-sing-config', description: '写入远端聪明唱歌 / MiMo TTS 配置（读取 .config/ai/mimo-tts-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "plugins:ai-sing:config" --path "${CONFIG_ROOT}/ai/mimo-tts-config.json" --remote`},
            {id: 'kv:get:remote:ai-sing-config', description: '读取远端聪明唱歌 / MiMo TTS 配置。', shell: 'wrangler kv key get --binding XBOT_KV "plugins:ai-sing:config" --remote'},
            {id: 'kv:set:local:xiuxian:set-config', description: '写入本地修仙装备套装配置（读取 .config/xiuxian/xiuxian-set-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "xiuxian:equipment:set-config" --path "${CONFIG_ROOT}/xiuxian/xiuxian-set-config.json" --local`},
            {id: 'kv:get:local:xiuxian:set-config', description: '读取本地修仙装备套装配置。', shell: 'wrangler kv key get --binding XBOT_KV "xiuxian:equipment:set-config" --local'},
            {id: 'kv:set:remote:xiuxian:set-config', description: '写入远端修仙装备套装配置（读取 .config/xiuxian/xiuxian-set-config.json）。', shell: `node ./_docs/scripts/init-local-configs.cjs --quiet && wrangler kv key put --binding XBOT_KV "xiuxian:equipment:set-config" --path "${CONFIG_ROOT}/xiuxian/xiuxian-set-config.json" --remote`},
            {id: 'kv:get:remote:xiuxian:set-config', description: '读取远端修仙装备套装配置。', shell: 'wrangler kv key get --binding XBOT_KV "xiuxian:equipment:set-config" --remote'},
        ],
    },
    {
        title: 'E. 数据同步与回滚',
        commands: [
            {id: 'sync:pull', description: '远端 -> 本地，一次同步 KV + D1，推荐日常使用。', steps: ['sync:d1:remote-to-local', 'sync:kv:remote-to-local']},
            {id: 'sync:push', description: '本地 -> 远端，默认带确认，并先备份远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-push-safe.ps1'},
            {id: 'sync:push:force', description: '无交互强制推送，适合脚本 / CI。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-push-safe.ps1 -Force'},
            {id: 'sync:rollback:last', description: '回滚最近一次 push 生成的远端备份。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-rollback-last-push.ps1'},
            {id: 'sync:rollback:last:force', description: '无交互强制回滚。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-rollback-last-push.ps1 -Force'},
            {id: 'sync:d1:remote-to-local', description: '只同步远端 D1 到本地。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-d1-remote-to-local.ps1'},
            {id: 'sync:kv:remote-to-local', description: '只同步远端 KV 到本地。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-kv-remote-to-local.ps1'},
            {id: 'sync:d1:local-to-remote', description: '只同步本地 D1 到远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-d1-local-to-remote.ps1'},
            {id: 'sync:kv:local-to-remote', description: '只同步本地 KV 到远端。', shell: 'powershell -NoProfile -ExecutionPolicy Bypass -File ./_docs/scripts/sync-kv-local-to-remote.ps1'},
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
        console.error('用法：node ./_docs/scripts/cloudflare-data-commands.cjs show <命令名>');
        process.exit(1);
    }
    printShow(id);
} else if (action === 'run') {
    if (!id) {
        console.error('用法：node ./_docs/scripts/cloudflare-data-commands.cjs run <命令名>');
        process.exit(1);
    }
    runCommand(id);
} else {
    console.error(`不支持的操作：${action}`);
    console.error('可用操作：list / show / run');
    process.exit(1);
}

