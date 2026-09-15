const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SOURCES = [
    path.resolve(REPO_ROOT, '..', 'one-agbot', 'script', 'sql', 'agbot_roleplay_character.sql'),
    path.resolve(REPO_ROOT, '..', 'one-agbot', 'script', 'sql', 'agbot_roleplay_character_extra.sql'),
];
const DEFAULT_OUT = path.join(REPO_ROOT, '_docs', 'roleplay', 'roleplay-character.sql');
const INSERT_BATCH = 8;

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
        throw new Error(`角色字段不完整: ${roleKey || '(no key)'}`);
    }
    return {roleKey, name, triggers, instruction, ack, status, sortNo};
}

function valuesSql(row) {
    return `(${sqliteString(row.roleKey)}, ${sqliteString(row.name)}, ${sqliteString(row.triggers)}, ${sqliteString(row.instruction)}, ${sqliteString(row.ack)}, ${sqliteString(row.status)}, ${row.sortNo})`;
}

function buildSql(rows) {
    const header = `-- 演法角色目录（Cloudflare D1）
-- 由 _docs/scripts/roleplay-from-mysql.cjs 从 one-agbot SQL 生成，勿手改。
-- 绑定仍在 KV：roleplay:bind:{platform}:{sessionId}

CREATE TABLE IF NOT EXISTS roleplay_character (
  role_key     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  triggers     TEXT NOT NULL DEFAULT '',
  instruction  TEXT NOT NULL,
  ack          TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',
  sort_no      INTEGER NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_roleplay_character_status
  ON roleplay_character(status, sort_no);
`;
    const chunks = [];
    for (let index = 0; index < rows.length; index += INSERT_BATCH) {
        const batch = rows.slice(index, index + INSERT_BATCH);
        chunks.push(
            `INSERT OR REPLACE INTO roleplay_character
    (role_key, name, triggers, instruction, ack, status, sort_no)
VALUES
${batch.map((row) => `    ${valuesSql(row)}`).join(',\n')};`,
        );
    }
    return `${header}\n${chunks.join('\n\n')}\n`;
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
    fs.mkdirSync(path.dirname(options.out), {recursive: true});
    fs.writeFileSync(options.out, buildSql(rows), 'utf8');
    console.log(`wrote ${rows.length} characters -> ${options.out}`);
}

main();
