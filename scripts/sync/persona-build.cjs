#!/usr/bin/env node
/**
 * 人格目录：.docs/persona/<分类>/<role_key>.md  →  .docs/sql/persona.sql
 *
 * md 是源，persona.sql 是生成物（删表重建，不用迁表）。
 * 分类 = 文件夹名，按 CATEGORIES 的顺序排。id 不分段，从 1 起依次编（类内按 sort、role_key）。
 *
 * 用法：node scripts/sync/persona-build.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, '.docs/persona');
const OUT = path.join(ROOT, '.docs/sql/persona.sql');

// 分类顺序就是排序，靠前的排前面。新分类加在这里，对应 .docs/persona/ 下同名文件夹。
const CATEGORIES = ['性格', '角色', '成长', '通用'];
// 只有这里列的分类会写进 persona.sql，其余的 md 留着不灌。要灌哪类，往这里加。
const ENABLED = ['性格', '角色', '成长'];
const BATCH = 8;

function sqlText(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function parseMd(file, text) {
    const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) throw new Error(`${file}：缺少开头的 --- 头`);
    const meta = {};
    for (const line of match[1].split('\n')) {
        if (!line.trim()) continue;
        const at = line.indexOf(':');
        if (at < 0) throw new Error(`${file}：头里这行没冒号：${line}`);
        meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    const instruction = match[2].trim();
    if (!meta.name) throw new Error(`${file}：缺 name`);
    if (!instruction) throw new Error(`${file}：正文是空的`);
    const sort = Number(meta.sort ?? 100);
    if (!Number.isInteger(sort)) throw new Error(`${file}：sort 要是整数`);
    return {
        name: meta.name,
        triggers: meta.triggers ?? '',
        ack: meta.ack ?? '',
        status: meta.status ?? 'active',
        sort,
        instruction,
    };
}

function load() {
    const known = new Set(CATEGORIES);
    for (const entry of fs.readdirSync(SRC_DIR, {withFileTypes: true})) {
        if (entry.isDirectory() && !known.has(entry.name)) {
            throw new Error(`文件夹「${entry.name}」没登记，先加到 CATEGORIES`);
        }
    }
    const seen = new Set();
    let nextId = 1;
    return CATEGORIES.filter((category) => ENABLED.includes(category)).map((category) => {
        const dir = path.join(SRC_DIR, category);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
        const rows = files.map((file) => {
            const roleKey = file.replace(/\.md$/, '');
            if (seen.has(roleKey)) throw new Error(`role_key 重复：${roleKey}`);
            seen.add(roleKey);
            const meta = parseMd(`${category}/${file}`, fs.readFileSync(path.join(dir, file), 'utf8'));
            return {roleKey, category, ...meta};
        });
        rows.sort((a, b) => a.sort - b.sort || a.roleKey.localeCompare(b.roleKey));
        for (const row of rows) row.id = nextId++;
        return {category, rows};
    });
}

function valuesSql(row) {
    return `    (${row.id}, ${sqlText(row.roleKey)}, ${sqlText(row.category)}, ${sqlText(row.name)}, `
        + `${sqlText(row.triggers)}, ${sqlText(row.instruction)}, ${sqlText(row.ack)}, `
        + `${sqlText(row.status)}, ${row.sort})`;
}

function buildSql(groups) {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const parts = [
        `-- 人格目录（Cloudflare D1）。生成文件，别手改：改 .docs/persona/ 下的 md，再 npm run data -- run persona:build。`,
        `-- 共 ${total} 个。执行时先删表再重建：运行中用 #加人格 加的会一并清掉，灌之前想留就先导出。`,
        `-- 绑定在 KV：persona:bind:{platform}:{sessionId}`,
        `-- id 不分段，按分类顺序（${ENABLED.join('、')}）从 1 起依次编；#加人格 加的接在最后一个 id 后面，分类记为「自定义」。`,
        `-- 查某一类：SELECT id, role_key, name FROM persona WHERE category = '性格' ORDER BY id;`,
        ``,
        `DROP TABLE IF EXISTS persona;`,
        ``,
        `CREATE TABLE persona (`,
        `  id           INTEGER PRIMARY KEY,`,
        `  role_key     TEXT NOT NULL UNIQUE,`,
        `  category     TEXT NOT NULL DEFAULT '',`,
        `  name         TEXT NOT NULL,`,
        `  triggers     TEXT NOT NULL DEFAULT '',`,
        `  instruction  TEXT NOT NULL,`,
        `  ack          TEXT NOT NULL DEFAULT '',`,
        `  status       TEXT NOT NULL DEFAULT 'active',`,
        `  sort_no      INTEGER NOT NULL DEFAULT 100`,
        `);`,
        ``,
        `CREATE INDEX idx_persona_status ON persona(status, sort_no);`,
        `CREATE INDEX idx_persona_category ON persona(category, id);`,
    ];
    for (const {category, rows} of groups) {
        if (!rows.length) continue;
        parts.push('', `-- ===== ${category}（${rows.length}）id ${rows[0].id}~${rows[rows.length - 1].id} =====`);
        for (let i = 0; i < rows.length; i += BATCH) {
            parts.push(
                '',
                'INSERT INTO persona',
                '    (id, role_key, category, name, triggers, instruction, ack, status, sort_no)',
                'VALUES',
                rows.slice(i, i + BATCH).map(valuesSql).join(',\n') + ';',
            );
        }
    }
    return parts.join('\n') + '\n';
}

function main() {
    const groups = load();
    fs.writeFileSync(OUT, buildSql(groups), 'utf8');
    for (const {category, rows} of groups) console.log(`${category}：${rows.length}`);
    console.log(`已写 ${path.relative(ROOT, OUT)}`);
}

try {
    main();
} catch (error) {
    console.error(`出错：${error.message}`);
    process.exit(1);
}
