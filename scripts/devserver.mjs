// A local harness for looking at the frontend. It serves site/ and answers the
// API with fixtures — there is no SQL Server on a laptop, and the real API is
// covered by test/logic.test.mjs and scripts/sqllint.mjs.
//
// This is for seeing the thing, not for testing the backend.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PORT = process.env.PORT || 8787;
const ROOT = 'site';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const CHILDREN = [
  { id: 'sol', name: 'Sol', year_group: 10, colour: '#1b62c4', key_stage: 'gcse',
    session_minutes: 50, sessions_per_day: 2, curriculum_id: 'year10' },
  { id: 'isaac', name: 'Isaac', year_group: 7, colour: '#6e22b4', key_stage: 'ks3',
    session_minutes: 35, sessions_per_day: 2, curriculum_id: 'year7' },
  { id: 'sophia', name: 'Sophia', year_group: 2, colour: '#e8710a', key_stage: 'ks1',
    session_minutes: null, sessions_per_day: 1, curriculum_id: 'year2' },
];

const PINS = { sol: '1111', isaac: '2222', sophia: '3333', __parent: '4321' };

const api = {
  '/api/health': () => ({ ok: true, harness: true }),
  '/api/ping': () => ({ ok: true }),
  '/api/children': () => ({ children: CHILDREN.map(({ id, name, year_group, colour }) =>
    ({ id, name, year_group, colour })) }),
  '/api/auth/child/login': (body) => {
    const child = CHILDREN.find((c) => c.id === body.child_id);
    if (!child || PINS[body.child_id] !== body.pin) return { __status: 401, error: 'Wrong PIN' };
    return { token: `dev-${child.id}`, expires_at: Date.now() + 3.6e6, child };
  },
  '/api/auth/parent/login': (body) =>
    body.pin === PINS.__parent
      ? { token: 'dev-parent', expires_at: Date.now() + 3.6e6 }
      : { __status: 401, error: 'Wrong PIN' },
  '/api/auth/logout': () => ({ ok: true }),
  '/api/parent/overview': () => ({
    children: CHILDREN.map((c) => ({
      child: { id: c.id, name: c.name, year_group: c.year_group },
      knownAndStillKnown: 0, componentsTracked: 0, mastered: 0, relearning: 0,
      delayedAccuracy: null, delayedSample: 0, targetBand: [0.85, 0.92],
      calibrationError: null, unaidedFirstAttemptRate: null,
      atRisk: [], wonderMoments: [], recentSessions: [],
    })),
  }),
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* empty */ }

    const handler = api[url.pathname];
    const out = handler ? handler(body) : { __status: 404, error: 'not in the harness' };
    const status = out.__status || 200;
    delete out.__status;
    res.writeHead(status, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  let file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(ROOT, 'index.html');       // single-page fallback
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`harness on http://127.0.0.1:${PORT}`));
