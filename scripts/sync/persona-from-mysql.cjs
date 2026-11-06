const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SOURCES = [
    path.resolve(REPO_ROOT, '..', 'one-agbot', 'script', 'sql', 'agbot_roleplay_character.sql'),
    path.resolve(REPO_ROOT, '..', 'one-agbot', 'script', 'sql', 'agbot_roleplay_character_extra.sql'),
];
// 只写「底」，不写 persona.sql：persona.sql 是正在用的、会被手改的版本，重跑本脚本不能把它盖掉。
const DEFAULT_OUT = path.join(REPO_ROOT, '.docs', 'sql', 'persona.baseline.sql');
const INSERT_BATCH = 8;

// id 按号段分大类：同一类的 id 连在一起，类与类之间留空，后面加人格不会挤乱。
//   1 ~  99  自定义：留给手动加的人格，源 SQL 里没有这类，生成时不写
// 100 ~ 999  通用
// 1000 ~ 1999 王者荣耀
// 2000 起     预留，新增分类往这里排
// 源 SQL 里没有分类，在这里维护。生成 SQL 时按这个顺序分段。
const CATEGORIES = [
    {name: '自定义', base: 1, end: 100},
    {name: '通用', base: 100, end: 1000},
    {name: '王者荣耀', base: 1000, end: 2000},
];
// sort_no 从这里起都是王者荣耀英雄，其余归通用
const WZRY_FROM_SORT = 290;

function categoryOf(row) {
    return row.sortNo >= WZRY_FROM_SORT ? '王者荣耀' : '通用';
}

function skipWs(text, index) {
    while (index < text.length && /\s/u.test(text[index])) index += 1;
    return index;
}

function parseSqlString(text, index) {
    if (text[index] !== "'") throw new Error(`期望字符串，位置 ${index}`);
    index += 1;
    let out = '';
    while (index < text.length) {
        const ch = text[index];
        if (ch === "'" && text[index + 1] === "'") {
            out += "'";
            index += 2;
            continue;
        }
        if (ch === "'") return {value: out, index: index + 1};
        out += ch;
        index += 1;
    }
    throw new Error('字符串未闭合');
}

function parseSqlValue(text, index) {
    index = skipWs(text, index);
    if (text.startsWith('NOW()', index)) return {value: null, index: index + 5};
    if (text[index] === "'") return parseSqlString(text, index);
    const match = /^-?\d+/u.exec(text.slice(index));
    if (!match) throw new Error(`无法解析值，位置 ${index}: ${text.slice(index, index + 40)}`);
    return {value: Number(match[0]), index: index + match[0].length};
}

function parseTuple(text, index) {
    index = skipWs(text, index);
    if (text[index] !== '(') throw new Error(`期望元组起点，位置 ${index}`);
    index += 1;
    const fields = [];
    while (index < text.length) {
        index = skipWs(text, index);
        if (text[index] === ')') return {fields, index: index + 1};
        if (fields.length > 0) {
            if (text[index] !== ',') throw new Error(`期望逗号，位置 ${index}`);
            index += 1;
            index = skipWs(text, index);
            if (text[index] === ')') return {fields, index: index + 1};
        }
        const parsed = parseSqlValue(text, index);
        fields.push(parsed.value);
        index = parsed.index;
    }
    throw new Error('元组未闭合');
}

function parseInsertTuples(sql) {
    const tuples = [];
    const re = /\bVALUES\b/giu;
    let match = re.exec(sql);
    while (match) {
        let index = skipWs(sql, match.index + match[0].length);
        if (sql[index] !== '(') {
            match = re.exec(sql);
            continue;
        }
        const peek = skipWs(sql, index + 1);
        if (!/[-0-9]/u.test(sql[peek] ?? '')) {
            match = re.exec(sql);
            continue;
        }
        while (index < sql.length) {
            index = skipWs(sql, index);
            if (sql[index] !== '(') break;
            const parsed = parseTuple(sql, index);
            tuples.push(parsed.fields);
            index = skipWs(sql, parsed.index);
            if (sql[index] === ',') {
                index += 1;
                continue;
            }
            break;
        }
        re.lastIndex = index;
        match = re.exec(sql);
    }
    return tuples;
}

function sqliteString(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function toCharacter(fields) {
    const roleKey = String(fields[1] ?? '').trim();
    const name = String(fields[2] ?? '').trim();
    const triggers = String(fields[3] ?? '');
    const instruction = String(fields[4] ?? '');
    const ack = String(fields[5] ?? '');
    const status = String(fields[6] ?? 'active').trim() || 'active';
    const sortNo = Number(fields[7] ?? 100);
    if (!roleKey || !name || !instruction) {
        throw new Error(`人格字段不完整: ${roleKey || '(no key)'}`);
    }
    return {roleKey, name, triggers, instruction, ack, status, sortNo};
}

function valuesSql(row) {
    return `(${row.id}, ${sqliteString(row.roleKey)}, ${sqliteString(row.category)}, ${sqliteString(row.name)}, ${sqliteString(row.triggers)}, ${sqliteString(row.instruction)}, ${sqliteString(row.ack)}, ${sqliteString(row.status)}, ${row.sortNo})`;
}

function buildSql(rows) {
    const header = `-- 人格目录的底（一次性从 one-agbot 导入的原始版本，只读，不用来灌库）。
-- 由 scripts/sync/persona-from-mysql.cjs 生成，勿手改。正在用的是同目录的 persona.sql，以它为准。
-- 只有要全量重做人格时，才重新导入这份底。
-- 绑定在 KV：persona:bind:{platform}:{sessionId}
-- 旧表 roleplay_character、旧键 roleplay:bind: 由 worker 第一次读到时迁过来。
-- id 是主键（INTEGER PRIMARY KEY，即 rowid），不写 ORDER BY 时表默认就按 id 顺序；role_key 唯一，代码按它找人格。
-- 注意：INSERT OR REPLACE 在 id 或 role_key 任一冲突时都会覆盖整行，所以各号段不能重叠。
-- 已有的旧表要先跑 .docs/sql/persona-columns.sql 重建，再跑本文件。
-- id 号段：1~99 自定义（留给手动加的，本文件不写）；100~999 通用；1000~1999 王者荣耀；2000 起预留。
-- 下面按分类分段，每段内按 id 排。查某一类：SELECT id, role_key, name FROM persona WHERE category = '王者荣耀' ORDER BY id;

CREATE TABLE IF NOT EXISTS persona (
  id           INTEGER PRIMARY KEY,
  role_key     TEXT NOT NULL UNIQUE,
  category     TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL,
  triggers     TEXT NOT NULL DEFAULT '',
  instruction  TEXT NOT NULL,
  ack          TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',
  sort_no      INTEGER NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_persona_status
  ON persona(status, sort_no);

CREATE INDEX IF NOT EXISTS idx_persona_category
  ON persona(category, id);
`;
    const sections = [];
    for (const {name: category, base, end} of CATEGORIES) {
        const group = rows.filter((row) => row.category === category);
        if (group.length === 0) continue;
        const chunks = [`-- ===== ${category || '未命名'}（${group.length}）id ${base}~${end - 1} =====`];
        for (let index = 0; index < group.length; index += INSERT_BATCH) {
            const batch = group.slice(index, index + INSERT_BATCH);
            chunks.push(
                `INSERT OR REPLACE INTO persona
    (id, role_key, category, name, triggers, instruction, ack, status, sort_no)
VALUES
${batch.map((row) => `    ${valuesSql(row)}`).join(',\n')};`,
            );
        }
        sections.push(chunks.join('\n\n'));
    }
    return `${header}\n${sections.join('\n\n')}\n`;
}

function parseArgs(argv) {
    const options = {sources: [], out: DEFAULT_OUT};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--out') {
            options.out = path.resolve(argv[index + 1]);
            index += 1;
            continue;
        }
        if (token === '--source') {
            options.sources.push(path.resolve(argv[index + 1]));
            index += 1;
            continue;
        }
        throw new Error(`未知参数：${token}`);
    }
    if (options.sources.length === 0) options.sources = DEFAULT_SOURCES;
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const seen = new Map();
    for (const file of options.sources) {
        if (!fs.existsSync(file)) throw new Error(`找不到源 SQL：${file}`);
        const tuples = parseInsertTuples(fs.readFileSync(file, 'utf8'));
        for (const fields of tuples) {
            const row = toCharacter(fields);
            seen.set(row.roleKey, row);
        }
    }
    const rows = [...seen.values()].sort((left, right) => left.sortNo - right.sortNo || left.roleKey.localeCompare(right.roleKey));
    if (rows.length !== 128) {
        throw new Error(`期望 128 个角色，实际 ${rows.length}`);
    }
    const used = new Map(CATEGORIES.map((item) => [item.name, 0]));
    for (const row of rows) {
        row.category = categoryOf(row);
        const range = CATEGORIES.find((item) => item.name === row.category);
        const offset = used.get(row.category);
        row.id = range.base + offset;
        if (row.id >= range.end) {
            throw new Error(`${row.category || '未命名'} 的号段 ${range.base}~${range.end - 1} 放不下了：${row.roleKey}`);
        }
        used.set(row.category, offset + 1);
    }
    fs.mkdirSync(path.dirname(options.out), {recursive: true});
    fs.writeFileSync(options.out, buildSql(rows), 'utf8');
    console.log(`wrote ${rows.length} characters -> ${options.out}`);
}

main();
