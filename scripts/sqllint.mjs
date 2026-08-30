// Checks every SQL statement in the API against the T-SQL dialect, and checks
// that each statement's `?` placeholders match the number of values bound to it.
//
// There is no SQL Server to test against in CI, and a mismatched parameter list
// in a hand-written MERGE is exactly the bug that would only surface when a
// child is mid-lesson. This catches both classes statically.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const dir = 'api/src/lib';
const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));

const statements = [];
const bindProblems = [];

for (const file of files) {
  const src = await readFile(`${dir}/${file}`, 'utf8');

  // Every `prepare(`...`)` template literal, plus what follows it.
  const re = /prepare\(\s*`([\s\S]*?)`\s*\)(?=([\s\S]{0,3000}))/g;
  let m;
  while ((m = re.exec(src))) {
    const sql = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    statements.push({ file, line, sql });

    const placeholders = (sql.match(/\?/g) || []).length;

    // Find the matching .bind( … ) call and count its top-level arguments.
    // Only look as far as the next prepare() or the terminating .first()/.all()/
    // .run(), so an unbound statement doesn't borrow the next one's arguments.
    let after = m[2];
    const nextPrepare = after.indexOf('prepare(');
    if (nextPrepare !== -1) after = after.slice(0, nextPrepare);
    const terminator = after.search(/\.(first|all|run)\(\)/);

    const bindAt = after.indexOf('.bind(');
    if (bindAt === -1 || (terminator !== -1 && bindAt > terminator)) {
      if (placeholders > 0) {
        bindProblems.push({ file, line, placeholders, bound: 0, note: 'no .bind() found' });
      }
      continue;
    }
    let depth = 0, i = bindAt + 6, args = 0, started = false, spread = false;
    for (; i < after.length; i++) {
      const c = after[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' && depth === 0) { if (started) args++; break; }
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) { args++; continue; }
      if (!/\s/.test(c)) {
        started = true;
        if (c === '.' && after.slice(i, i + 3) === '...') spread = true;
      }
    }
    if (spread) continue;                       // spread args can't be counted statically
    if (args !== placeholders) {
      bindProblems.push({ file, line, placeholders, bound: args });
    }
  }
}

// ── dialect parse, via sqlglot ────────────────────────────────────────────
const payload = statements.map((s) => s.sql);
await writeFile('/tmp/sqllint.json', JSON.stringify(payload));
await writeFile('/tmp/sqllint.py', `
import json, sys
import sqlglot
stmts = json.load(open('/tmp/sqllint.json'))
bad = []
for i, s in enumerate(stmts):
    try:
        sqlglot.parse_one(s, dialect='tsql')
    except Exception as e:
        bad.append([i, str(e).split('\\n')[0][:160]])
print(json.dumps(bad))
`);
const { stdout } = await run('python3', ['/tmp/sqllint.py']);
const parseErrors = JSON.parse(stdout);

// ── schema ────────────────────────────────────────────────────────────────
await writeFile('/tmp/schema.py', `
import sqlglot, sys
sql = open('migrations/azure/0001_init.sql').read()
try:
    n = len(sqlglot.parse(sql, dialect='tsql'))
    print(f'schema OK: {n} statements')
except Exception as e:
    print('SCHEMA ERROR:', str(e).split(chr(10))[0][:200]); sys.exit(1)
`);
const schema = await run('python3', ['/tmp/schema.py']).then((r) => r.stdout.trim())
  .catch((e) => `SCHEMA FAILED\n${e.stdout || e.message}`);

console.log(`checked ${statements.length} SQL statements across ${files.length} files`);
console.log(schema);

if (parseErrors.length) {
  console.log(`\n${parseErrors.length} statement(s) failed to parse as T-SQL:`);
  for (const [i, msg] of parseErrors) {
    const s = statements[i];
    console.log(`  ${s.file}:${s.line}  ${msg}`);
    console.log(`    ${s.sql.trim().slice(0, 140).replace(/\s+/g, ' ')}`);
  }
} else {
  console.log('all statements parse as T-SQL');
}

if (bindProblems.length) {
  console.log(`\n${bindProblems.length} parameter-count mismatch(es):`);
  for (const p of bindProblems) {
    console.log(`  ${p.file}:${p.line}  ${p.placeholders} placeholders vs ${p.bound} bound${p.note ? ` (${p.note})` : ''}`);
  }
} else {
  console.log('every statement binds exactly as many values as it has placeholders');
}

process.exit(parseErrors.length || bindProblems.length ? 1 : 0);
