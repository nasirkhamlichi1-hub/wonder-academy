// The parts that decide what a child is asked and whether they got it right.
// These run without a database, because the rules matter more than the storage.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRating, interleave, isMastered, seedFromPlacement, Rating, State }
  from '../api/src/lib/srs.js';
import { normalise, gradeClosed } from '../api/src/lib/grade.js';
import { buildSession } from '../api/src/lib/session.js';
import { buildLessonPrompt, REGISTER, PEDAGOGY } from '../api/src/lib/prompt.js';
import { readCurriculum } from '../api/src/lib/assets.js';

// ───────────────────────── deriving the rating ─────────────────────────

test('a wrong answer is Again, however fast it came', () => {
  assert.equal(deriveRating({ correct: false, scaffoldLevel: 0, itemType: 'A' }), Rating.Again);
});

test('being told the answer is never credit', () => {
  assert.equal(deriveRating({ correct: true, scaffoldLevel: 4, itemType: 'A' }), Rating.Again);
  assert.equal(deriveRating({ correct: true, scaffoldLevel: 6, itemType: 'A' }), Rating.Again);
});

test('any scaffold at all caps the rating at Hard', () => {
  for (const level of [1, 2, 3]) {
    assert.equal(
      deriveRating({ correct: true, scaffoldLevel: level, latencyMs: 100, p50: 5000, itemType: 'A' }),
      Rating.Hard, `scaffold level ${level} should cap at Hard`);
  }
});

test('a half-right open answer is Hard, a mostly-wrong one is Again', () => {
  assert.equal(deriveRating({ correct: true, partial: 0.5, itemType: 'C' }), Rating.Hard);
  assert.equal(deriveRating({ correct: true, partial: 0.2, itemType: 'C' }), Rating.Again);
});

test('Easy needs unaided, complete and genuinely fast', () => {
  assert.equal(
    deriveRating({ correct: true, scaffoldLevel: 0, latencyMs: 1000, p50: 5000, partial: 1, itemType: 'A' }),
    Rating.Easy);
  // slow but right is Good, not Easy
  assert.equal(
    deriveRating({ correct: true, scaffoldLevel: 0, latencyMs: 4000, p50: 5000, partial: 1, itemType: 'A' }),
    Rating.Good);
});

test('latency never grades a concept — only facts and procedures', () => {
  assert.equal(
    deriveRating({ correct: true, scaffoldLevel: 0, latencyMs: 100, p50: 5000, partial: 1, itemType: 'C' }),
    Rating.Good, 'a fast concept answer must not become Easy on speed alone');
  assert.equal(
    deriveRating({ correct: true, scaffoldLevel: 0, latencyMs: 90000, p50: 5000, partial: 1, itemType: 'C' }),
    Rating.Good, 'a slow concept answer must not be punished on speed alone');
});

// ───────────────────────────── interleaving ─────────────────────────────

const card = (subject, strand, extra = {}) => ({
  subject, strand, state: State.Review, consec_correct: 2, lapses: 0, ...extra,
});

test('never three in a row from the same family', () => {
  const items = [
    ...Array.from({ length: 6 }, () => card('maths', 'number')),
    ...Array.from({ length: 6 }, () => card('science', 'cells')),
    ...Array.from({ length: 6 }, () => card('english', 'grammar')),
  ];
  const out = interleave(items);
  assert.equal(out.length, items.length, 'nothing may be dropped');
  for (let i = 2; i < out.length; i++) {
    const fam = (c) => `${c.subject}:${c.strand}`;
    assert.ok(
      !(fam(out[i]) === fam(out[i - 1]) && fam(out[i]) === fam(out[i - 2])),
      `three consecutive ${fam(out[i])} items at index ${i}`);
  }
});

test('the session does not open on the item they last failed', () => {
  const items = [
    card('maths', 'number', { state: State.Relearning, consec_correct: 0 }),
    card('science', 'cells'),
    card('english', 'grammar'),
  ];
  assert.notEqual(interleave(items)[0].state, State.Relearning);
});

// ───────────────────────────── mastery gates ─────────────────────────────

const solid = {
  distinct_days_correct: 3, stability: 25, unaided_recent: 2,
  interleaved_correct: 2, variants_seen: 2, median_latency_ms: 2000, item_type: 'A',
};

test('all five gates together mean mastered', () => {
  assert.equal(isMastered(solid, { target_latency_ms: 3000 }), true);
});

test('each gate alone can withhold mastery', () => {
  const cases = {
    'only two distinct days': { distinct_days_correct: 2 },
    'stability under three weeks': { stability: 20 },
    'last answers needed help': { unaided_recent: 1 },
    'never right when interleaved': { interleaved_correct: 1 },
    'too slow for a fact': { median_latency_ms: 9000 },
  };
  for (const [why, patch] of Object.entries(cases)) {
    assert.equal(isMastered({ ...solid, ...patch }, { target_latency_ms: 3000 }), false, why);
  }
});

test('a generated procedure must be right on more than one variant', () => {
  assert.equal(
    isMastered({ ...solid, item_type: 'B', variants_seen: 1 }, { target_latency_ms: 30000 }),
    false);
});

// ───────────────────── placement: last year's knowledge ─────────────────────

test('a fast unaided pass starts three weeks ahead, not from zero', () => {
  const seeded = seedFromPlacement({ passedUnaided: true, fastUnaided: true });
  assert.equal(seeded.stability, 21);
  assert.equal(seeded.state, State.Review);
  assert.equal(seeded.seeded, 1);
});

test('a failed probe starts as new', () => {
  const fresh = seedFromPlacement({ passedUnaided: false, fastUnaided: false });
  assert.equal(fresh.state, State.New);
  assert.equal(fresh.seeded, 0);
});

// ─────────────────────── grading what a child said ───────────────────────

test('spoken numbers become numbers', () => {
  assert.equal(normalise('twenty four'), '24');
  assert.equal(normalise('one hundred and twenty'), '120');
  assert.equal(normalise('three hundred and sixty five'), '365');
  assert.equal(normalise('a half'), '1/2');
});

test('fillers and hedging never cost a mark', () => {
  assert.equal(gradeClosed("um, I think it's twenty four", '24').correct, true);
  assert.equal(gradeClosed('er, maybe 24', '24').correct, true);
});

test('a self-correction is graded on the final answer', () => {
  assert.equal(gradeClosed('seventeen, no wait, twenty four', '24').correct, true);
  assert.equal(gradeClosed('twenty four, actually seventeen', '24').correct, false);
});

test('any of several accepted answers will do', () => {
  assert.equal(gradeClosed('photosynthesis', ['photosynthesis', 'photo synthesis']).correct, true);
});

test('a one-character transcript is treated as mis-heard, not wrong', () => {
  const r = gradeClosed('t', '24');
  assert.equal(r.correct, false);
  assert.equal(r.asr_suspect, true, 'should ask again rather than mark it wrong');
});

// ───────────────────────── building a session ─────────────────────────

/** Enough of the database for the session builder to run. */
function stubDb(rows = {}) {
  return {
    prepare: (sql) => ({
      bind: () => ({
        all: async () => ({ results: rows[matchTable(sql)] || [] }),
        first: async () => (rows[matchTable(sql)] || [])[0] || null,
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: rows[matchTable(sql)] || [] }),
      first: async () => (rows[matchTable(sql)] || [])[0] || null,
      run: async () => ({ success: true }),
    }),
  };
}
const matchTable = (sql) =>
  /srs_card/.test(sql) ? 'srs_card'
  : /lesson_attempts/.test(sql) ? 'lesson_attempts'
  : /learning_sessions/.test(sql) ? 'learning_sessions' : 'other';

const env = { DB: stubDb(), readCurriculum };

const CHILDREN = {
  sol: { id: 'sol', display_name: 'Sol', year_group: 10, key_stage: 'gcse',
    curriculum_id: 'year10', session_minutes: 50, sessions_per_day: 2,
    new_items_per_day: 17, request_retention: 0.9 },
  isaac: { id: 'isaac', display_name: 'Isaac', year_group: 7, key_stage: 'ks3',
    curriculum_id: 'year7', session_minutes: 35, sessions_per_day: 2,
    new_items_per_day: 12, request_retention: 0.85 },
  sophia: { id: 'sophia', display_name: 'Sophia', year_group: 2, key_stage: 'ks1',
    curriculum_id: 'year2', session_minutes: null, sessions_per_day: 1,
    new_items_per_day: 5, request_retention: 0.85 },
};

test('every child gets a lesson with the phases their age needs', async () => {
  for (const [name, child] of Object.entries(CHILDREN)) {
    const plan = await buildSession(env, child, { block: 1 });
    assert.ok(!plan.error, `${name}: ${plan.error}`);
    assert.ok(plan.lesson.title, `${name} has a lesson title`);
    assert.ok(plan.lesson.objectives.length, `${name} has objectives`);

    const phases = plan.phases.map((p) => p.phase);
    assert.ok(phases.includes('warmup'), `${name} opens on retrieval`);
    assert.ok(phases.includes('teachback'), `${name} explains it back`);
    assert.ok(phases.includes('break'), `${name} gets to move`);
  }
});

test('the prequestion phase is marked as a pretest, so failing it costs nothing', async () => {
  const plan = await buildSession(env, CHILDREN.sol, { block: 1 });
  const pre = plan.phases.find((p) => p.phase === 'prequestion');
  assert.equal(pre.pretest, true);
});

test('Sophia gets cued retrieval, because free recall does not work at six', async () => {
  const plan = await buildSession(env, CHILDREN.sophia, { block: 1 });
  const warmup = plan.phases.find((p) => p.phase === 'warmup');
  assert.equal(warmup.cued, true);
  assert.equal(plan.sessionMinutes, null, 'Sophia has no time target');
});

test('older children get a bigger share of the session on review', async () => {
  const sol = await buildSession(env, CHILDREN.sol, { block: 1 });
  const sophia = await buildSession(env, CHILDREN.sophia, { block: 1 });
  assert.ok(sol.reviewNewRatio > sophia.reviewNewRatio);
});

test('the new-item allowance is split across the day, not repeated per session', async () => {
  const plan = await buildSession(env, CHILDREN.sol, { block: 1 });
  assert.ok(plan.newComponents.length <= Math.ceil(17 / 2) + 1,
    `one block should not introduce the whole day's new items (got ${plan.newComponents.length})`);
});

test('lesson vocabulary is seeded into the speech recogniser', async () => {
  const plan = await buildSession(env, CHILDREN.isaac, { block: 1 });
  assert.ok(Array.isArray(plan.asrKeywords));
  assert.ok(plan.asrKeywords.length <= 50, 'ElevenLabs caps ASR keywords at 50');
});

// ───────────────────────────── the teacher ─────────────────────────────

test("the lesson prompt carries both the register and the pedagogy, and today's content", async () => {
  const plan = await buildSession(env, CHILDREN.sol, { block: 1 });
  const prompt = buildLessonPrompt(CHILDREN.sol, plan);
  assert.ok(prompt.includes(REGISTER), 'register block present');
  assert.ok(prompt.includes(PEDAGOGY), 'pedagogy block present');
  assert.ok(prompt.includes(plan.lesson.title), "today's lesson named");
  assert.ok(prompt.includes('Sol'), 'the child is named');
  assert.match(prompt, /Never mention scores, minutes remaining/,
    'the agent is told not to surface the schedule to the child');
});

test('the six-year-old gets the stop-while-she-wants-more instruction', async () => {
  const plan = await buildSession(env, CHILDREN.sophia, { block: 1 });
  const prompt = buildLessonPrompt(CHILDREN.sophia, plan);
  assert.match(prompt, /stop while she still wants more/i);
});

test('the register forbids the failure modes that matter', () => {
  assert.match(REGISTER, /No baby talk/);
  assert.match(REGISTER, /Never give an answer the child could reach with one more question/);
  assert.match(PEDAGOGY, /Maximum two failed attempts/);
  assert.match(PEDAGOGY, /your FIRST move is "Take your time." Never a hint/);
});
