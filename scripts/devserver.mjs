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

// Enough of a shelf to judge the layout by. Numbers are plausible for a few
// weeks in, not zeroes — a grid of empty bars tells you nothing about whether
// the design works.
const SUBJECTS = {
  year10: [
    ['maths', 'GCSE Mathematics', 'Maths', 'AQA', 604, 148, 22],
    ['english-language', 'GCSE English Language', 'English Language', 'AQA', 402, 96, 8],
    ['english-literature', 'GCSE English Literature', 'English Literature', 'AQA', 388, 71, 0],
    ['science', 'GCSE Combined Science: Trilogy', 'Combined Science', 'AQA', 535, 102, 31],
    ['geography', 'GCSE Geography', 'Geography', 'AQA', 561, 118, 5],
    ['business', 'GCSE Business', 'Business', 'AQA', 532, 84, 12],
  ],
  year7: [
    ['maths', 'KS3 Mathematics', 'Maths', null, 612, 141, 17],
    ['english', 'KS3 English', 'English', null, 498, 108, 6],
    ['science', 'KS3 Science', 'Science', null, 544, 96, 20],
    ['geography', 'KS3 Geography', 'Geography', null, 182, 31, 0],
    ['history', 'KS3 History', 'History', null, 178, 28, 3],
    ['computing', 'KS3 Computing', 'Computing', null, 141, 22, 0],
  ],
  year2: [
    ['english', 'English', 'English', null, 488, 121, 9],
    ['maths', 'Maths', 'Maths', null, 512, 133, 6],
    ['science', 'Science', 'Science', null, 268, 44, 0],
    ['discover', 'Discover', 'Discover', null, 220, 38, 2],
  ],
};

const LESSON = {
  id: 'm-autumn1-w3-l2',
  title: 'Adding and subtracting fractions with different denominators',
  subject: 'maths', subjectName: 'GCSE Mathematics', unit: 'Fractions and decimals',
  specRef: 'N8', bigRock: true, termName: 'Autumn 1', week: 3,
  objectives: [
    'find a common denominator using the lowest common multiple',
    'add and subtract fractions and mixed numbers',
    'say when an answer still needs simplifying',
  ],
  vocabulary: ['denominator', 'lowest common multiple', 'equivalent fraction', 'improper fraction'],
};

const api = {
  '/api/health': () => ({ ok: true, harness: true }),
  '/api/ping': () => ({ ok: true }),
  '/api/child/today': (_b, who) => {
    const child = CHILDREN.find((c) => c.id === who) || CHILDREN[0];
    return {
      child,
      subjects: (SUBJECTS[child.curriculum_id] || []).map(
        ([id, name, short, board, total, held, due]) => ({
          id, name, short, board, total, held, due, met: held + due * 3,
          progress: held / total, strand: 'core',
        })),
      blocks: [{ block: 1, started: false, completed: false },
               { block: 2, started: false, completed: false }],
      wonders: child.id === 'sol'
        ? ['Why does a negative times a negative give a positive?',
           'If the Earth is spinning why can I not feel it?']
        : [],
    };
  },
  '/api/session/start': () => ({
    session: {
      id: 'sess_demo', block: 1, lesson: LESSON,
      phases: [
        { phase: 'warmup', label: 'Warm up' },
        { phase: 'prequestion', label: 'Before we start' },
        { phase: 'listen', label: 'Listen' },
        { phase: 'read', label: 'Read' },
        { phase: 'new', label: 'The new idea' },
        { phase: 'practice', label: 'Your turn' },
        { phase: 'teachback', label: 'Explain it back',
          prompt: 'Tell me how you would add three quarters and two thirds.',
          sentenceStarter: 'First I would' },
        { phase: 'consolidation', label: 'Last few' },
      ],
    },
    voice: { overrides: {}, dynamicVariables: {}, asrKeywords: [] },
  }),
  '/api/voice/token': () => ({ token: 'demo' }),
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
    children: CHILDREN.map((c, i) => ({
      child: { id: c.id, name: c.name, year_group: c.year_group, colour: c.colour },
      knownAndStillKnown: [619, 426, 336][i],
      componentsTracked: [1240, 980, 640][i], mastered: [619, 426, 336][i], relearning: [31, 22, 9][i],
      delayedAccuracy: [0.89, 0.86, 0.91][i], delayedSample: [214, 156, 88][i],
      targetBand: [0.85, 0.92], calibrationError: 0.03,
      unaidedFirstAttemptRate: [0.78, 0.71, 0.83][i],
      atRisk: i === 0
        ? [{ question: 'What does the gradient of a distance–time graph tell you?', subject: 'Maths' },
           { question: 'Why is the Haber process run at 450 °C and not higher?', subject: 'Science' }]
        : i === 1
          ? [{ question: 'What is the difference between weathering and erosion?', subject: 'Geography' }]
          : [],
      wonderMoments: i === 0
        ? [{ question: 'Why does a negative times a negative give a positive?' }] : [],
      recentSessions: [],
    })),
  }),
};

/** The harness has no cookies; the token doubles as the child id. */
function whoFrom(req) {
  const raw = req.headers['x-wa-auth'] || req.headers.authorization || '';
  return String(raw).replace(/^Bearer\s+/, '').replace(/^dev-/, '');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* empty */ }

    const handler = api[url.pathname];
    const out = handler ? handler(body, whoFrom(req)) : { __status: 404, error: 'not in the harness' };
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
