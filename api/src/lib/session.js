// The session builder. Produces the minute-by-minute plan the voice teacher
// and the UI both run against.
//
//   PREQUESTION -> LISTEN -> READ -> DO -> EXPLAIN BACK -> RETRIEVE
//
// Each transition earns its place on evidence: prequestions create the knowledge
// gap and make the listening active; audio carries narrative, orientation and
// wonder; the inferential work is READ because reading beats listening for
// inference and can be re-read at the child's own pace; DO converts recognition
// into recall; EXPLAIN BACK is generative processing and the cleanest diagnostic
// signal available. Retrieval checkpoints sit between every phase because
// interpolated testing halves mind-wandering — breaks do not.
//
// There is no "learning style" anywhere in this file, and there never should be.

import { id, now, dayKey, DAY_MS } from './util.js';
import { makeScheduler, buildReviewQueue, retrievability } from './srs.js';
import { loadCurriculum, nextLessons, targetLatency } from './curriculum.js';

/** Phase templates, in minutes, by age band. */
const TEMPLATES = {
  gcse: [                                    // 50-minute block
    { phase: 'warmup',        from: 0,  to: 6,  label: 'Warm-up retrieval', items: 15 },
    { phase: 'prequestion',   from: 6,  to: 9,  label: 'Prequestions',      items: 3 },
    { phase: 'listen',        from: 9,  to: 15, label: 'Listen',            segments: 2 },
    { phase: 'break',         from: 15, to: 17, label: 'Stand up, water, look out of a window' },
    { phase: 'read',          from: 17, to: 28, label: 'Read & worked examples' },
    { phase: 'practice',      from: 28, to: 40, label: 'Practice',          items: 14 },
    { phase: 'teachback',     from: 40, to: 46, label: 'Explain it back' },
    { phase: 'consolidation', from: 46, to: 50, label: 'Consolidate',       items: 4 },
  ],
  ks3: [                                     // 35-minute block
    { phase: 'warmup',        from: 0,  to: 5,  label: 'Warm-up retrieval', items: 12 },
    { phase: 'prequestion',   from: 5,  to: 7,  label: 'Prequestions',      items: 2 },
    { phase: 'listen',        from: 7,  to: 13, label: 'Listen',            segments: 2 },
    { phase: 'break',         from: 13, to: 15, label: 'Move about' },
    { phase: 'read',          from: 15, to: 22, label: 'Read & worked example' },
    { phase: 'practice',      from: 22, to: 29, label: 'Practice',          items: 11 },
    { phase: 'teachback',     from: 29, to: 33, label: 'Explain it back' },
    { phase: 'consolidation', from: 33, to: 35, label: 'Consolidate',       items: 3 },
  ],
  ks1: [                                     // untimed micro-cycles
    { phase: 'warmup',   cycle: 1, minutes: 6, label: 'What do we remember?', items: 9, cued: true },
    { phase: 'break',    cycle: 1, minutes: 2, label: 'Jump and count' },
    { phase: 'new',      cycle: 2, minutes: 8, label: 'Something new',        items: 3 },
    { phase: 'break',    cycle: 2, minutes: 2, label: 'Move about' },
    { phase: 'practice', cycle: 3, minutes: 7, label: 'Have a go',            items: 10 },
    { phase: 'break',    cycle: 3, minutes: 2, label: 'Stretch' },
    { phase: 'teachback',cycle: 4, minutes: 5, label: 'Tell me what we found out' },
  ],
};

/**
 * Share of the session spent on retrieval of things already met. Consolidation
 * days run 70:30 and introduce nothing new.
 *
 * These are not guesses. Simulating the year against the real curriculum (see
 * scripts/simulate.mjs) at these rates covers 100% of the Year 10 and Year 7
 * schemes with the review queue staying inside its budget and effectively no
 * overflow. Year 1 deliberately sits lower — see the note in buildSession.
 */
export function reviewRatio(keyStage, consolidationDay) {
  if (consolidationDay) return 0.7;
  return keyStage === 'gcse' ? 0.48 : keyStage === 'ks3' ? 0.45 : 0.32;
}

/** One day in five is a consolidation day — no new components at all. */
function isConsolidationDay(at) {
  const d = new Date(at);
  return d.getUTCDay() === 5;     // Fridays
}

export async function buildSession(env, child, { block = 1, subject = null, at = Date.now() } = {}) {
  const curriculum = await loadCurriculum(env, child.curriculum_id);
  const scheduler = makeScheduler(child);
  const keyStage = child.key_stage;
  const template = TEMPLATES[keyStage] || TEMPLATES.ks3;
  const consolidation = isConsolidationDay(at);

  // ── pick the lesson ─────────────────────────────────────────────
  const { bySubject: upcoming, progress, anchored, anchorWindow } =
    await nextLessons(env, child, curriculum);
  let lesson = subject ? upcoming.get(subject) : null;

  // What was taught in the last few hours, so the second block of a day is a
  // different subject from the first.
  const recent = await env.DB.prepare(
    `SELECT TOP (3) subject FROM learning_sessions
     WHERE child_id = ? AND started_at > ? ORDER BY started_at DESC`
  ).bind(child.id, at - DAY_MS / 2).all();
  const seen = new Set((recent.results || []).map((r) => r.subject));

  // A date-pinned week that has come due outranks the ordinary sequence.
  if (!lesson) {
    const due = anchored.find(
      (a) => a.at <= at && at < a.at + anchorWindow && !seen.has(a.lesson.subject));
    if (due) lesson = due.lesson;
  }

  if (!lesson) {
    // Pick the subject that is furthest behind, skipping whatever was taught in
    // the last few hours so the second block of a day differs from the first.
    //
    // This used to take the first candidate not taught in the last 24 hours,
    // which sounds like rotation and is not. `seen` only ever held the sessions
    // inside a 24-hour window, so at the first block of a new day it was empty
    // and the pick fell to candidates[0] — the first subject in the curriculum
    // file. The second block then took candidates[1]. Every day. Simulated over
    // forty days, Isaac was taught maths and English eighty times out of eighty
    // and never once met science, geography, history, computing, Arabic, ICT,
    // MSCS or his modern language. Nothing looked wrong: the lessons it did
    // serve were correct, so the failure was invisible from inside a session.
    //
    // Ranking by least-progressed also fixes a fairness problem that plain
    // round-robin has even when it works: equal airtime starves the biggest
    // subjects, so science (410 components) would finish the year further
    // behind than computing (340) purely for being larger.
    // Rank by how far through the subject the child is, divided by the
    // subject's weight — so a subject with weight 2 is chosen until it sits
    // roughly twice as far through as its weight-1 siblings.
    const weightOf = new Map(curriculum.subjects.map((s) => [s.id, s.weight || 1]));
    const rank = (l) => (progress.get(l.subject)?.ratio ?? 0) / (weightOf.get(l.subject) || 1);
    const candidates = [...upcoming.values()].sort((a, b) => rank(a) - rank(b));
    lesson = candidates.find((l) => !seen.has(l.subject)) || candidates[0];
  }
  if (!lesson) return { error: 'curriculum_complete' };

  // ── the review queue ────────────────────────────────────────────
  const cards = await env.DB.prepare(
    `SELECT TOP (400) * FROM srs_card WHERE child_id = ? AND suspended = 0 AND due <= ?
     ORDER BY due ASC`
  ).bind(child.id, at).all();

  const sessionMinutes = child.session_minutes
    || template.reduce((s, p) => s + (p.minutes || (p.to - p.from)), 0);
  const ratio = reviewRatio(keyStage, consolidation);
  const reviewBudgetSeconds = Math.round(sessionMinutes * 60 * ratio);

  const { queue, overflow, dueCount } = buildReviewQueue(
    cards.results || [], scheduler, at, reviewBudgetSeconds);

  // Postpone the overflow rather than dropping it.
  for (const o of overflow) {
    await env.DB.prepare(
      `UPDATE srs_card SET due = due + ? WHERE child_id = ? AND component_id = ?`
    ).bind(o.push * DAY_MS, child.id, o.component_id).run();
  }

  // ── the new components for today ────────────────────────────────
  const lessonComponents = curriculum.componentsByLesson.get(lesson.id) || [];
  const existing = await env.DB.prepare(
    `SELECT component_id FROM srs_card WHERE child_id = ?`).bind(child.id).all();
  const known = new Set((existing.results || []).map((r) => r.component_id));

  const eligible = [];
  for (const c of lessonComponents) {
    if (known.has(c.id)) continue;
    if (!(await prerequisitesMet(env, child, c))) continue;
    eligible.push(c);
  }

  // Lessons vary in how much they introduce. If this one carries fewer
  // components than the day's allowance, top up from the next lessons in the
  // same subject — otherwise the year's coverage quietly falls short of what the
  // simulation says the child can carry.
  const wantedHere = Math.max(1, Math.ceil(
    (child.new_items_per_day || 4) / (child.sessions_per_day || 1)));
  if (eligible.length < wantedHere) {
    const sameSubject = curriculum.lessons.filter(
      (l) => l.subject === lesson.subject && l.id !== lesson.id);
    const startAt = sameSubject.findIndex((l) => l.id === lesson.id) + 1;
    for (const l of sameSubject.slice(Math.max(0, startAt))) {
      if (eligible.length >= wantedHere) break;
      for (const c of curriculum.componentsByLesson.get(l.id) || []) {
        if (eligible.length >= wantedHere) break;
        if (known.has(c.id) || eligible.some((e) => e.id === c.id)) continue;
        if (!(await prerequisitesMet(env, child, c))) continue;
        eligible.push(c);
      }
    }
  }
  // New items are spread across the day's blocks, so the per-day rate is what
  // the governor and the simulation are talking about — not the per-session one.
  const perBlock = Math.max(1, Math.ceil(child.new_items_per_day / (child.sessions_per_day || 1)));
  const newCap = consolidation ? 0 : perBlock;
  const newComponents = eligible.slice(0, newCap);

  // Year 1 is deliberately not scheduled to cover every component in the scheme.
  // At five new items a day she reaches about two thirds of it, and the rest can
  // wait for Year 2. Pushing to full coverage would mean fifteen minutes of daily
  // drilling for a six-year-old, which is the opposite of stopping while she
  // still wants more.

  // ── hydrate the queue with component detail ─────────────────────
  const reviewItems = queue.map((row) => {
    const comp = curriculum.componentById.get(row.component_id);
    return {
      component_id: row.component_id,
      statement: comp?.statement || row.component_id,
      item_type: row.item_type || comp?.item_type || 'C',
      subject: row.subject,
      strand: row.strand,
      retrievability: Number(retrievability(scheduler, row, at).toFixed(3)),
      lapses: row.lapses,
      target_latency_ms: targetLatency(row.item_type, keyStage),
      rubric: comp?.rubric || null,
      interleaved: true,
    };
  }).filter((i) => i.statement);

  // ── assemble the plan ───────────────────────────────────────────
  let cursor = 0;
  const phases = template.map((slot) => {
    const minutes = slot.minutes || (slot.to - slot.from);
    const from = slot.from ?? cursor;
    cursor = from + minutes;

    const base = {
      phase: slot.phase,
      label: slot.label,
      cycle: slot.cycle || null,
      fromMinute: from,
      toMinute: from + minutes,
      minutes,
    };

    switch (slot.phase) {
      case 'warmup':
        return { ...base, cued: !!slot.cued, items: reviewItems.slice(0, slot.items || 12) };
      case 'prequestion':
        return {
          ...base,
          // Asked BEFORE teaching. Graded and logged, but excluded from FSRS —
          // failing a prequestion is pedagogically valuable and schedulingly
          // meaningless.
          pretest: true,
          items: newComponents.slice(0, slot.items || 3).map(toPrompt),
        };
      case 'listen':
        return {
          ...base,
          segments: buildAudioSegments(lesson, slot.segments || 2),
          checkpointAfterEachSegment: true,
        };
      case 'read':
        return { ...base, reading: buildReading(lesson), selfExplanationEvery: 2 };
      case 'new':
        return { ...base, items: newComponents.slice(0, slot.items || 3).map(toPrompt) };
      case 'practice':
        return { ...base, items: buildPractice(reviewItems, newComponents, slot.items || 12, keyStage) };
      case 'teachback':
        return {
          ...base,
          prompt: `Explain today's idea to me as if I had never heard it.`,
          agentPlaysConfused: true,
          sentenceStarter: keyStage === 'gcse' ? null : `So the main thing is…`,
        };
      case 'consolidation':
        return {
          ...base,
          items: [
            ...newComponents.slice(0, 2).map(toPrompt),
            ...reviewItems.filter((i) => i.retrievability < 0.85).slice(0, 2),
          ],
          hookForTomorrow: true,
        };
      default:
        return base;
    }
  });

  return {
    id: id('ses_'),
    child_id: child.id,
    block,
    keyStage,
    consolidationDay: consolidation,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      subjectName: lesson.subjectName,
      objectives: lesson.objectives || [],
      specRef: lesson.specRef || lesson.ncRef || null,
      vocabulary: lesson.vocabulary || [],
      misconceptions: lesson.misconceptions || [],
      assessment: lesson.assessment || null,
      bigRock: !!lesson.bigRock,
      unit: lesson.unit,
      termName: lesson.termName,
      week: lesson.week,
      phonicsPhase: lesson.phonicsPhase,
      gpcs: lesson.gpcs,
      commonExceptionWords: lesson.commonExceptionWords,
      ks2Prerequisites: lesson.ks2Prerequisites || null,
    },
    sessionMinutes: child.session_minutes,     // null for Lily — untimed
    reviewNewRatio: ratio,
    dueCount,                                  // parent/coach only — never shown to the child
    overflowCount: overflow.length,
    newComponents: newComponents.map(toPrompt),
    phases,
    // ASR keyword seeding: children's speech is harder to recognise than adults',
    // and subject vocabulary is exactly what gets mis-transcribed.
    asrKeywords: [
      ...(lesson.vocabulary || []),
      ...newComponents.flatMap((c) => (c.statement || '').split(/\s+/).filter((w) => w.length > 7)),
    ].slice(0, 50),
  };
}

function toPrompt(c) {
  return {
    component_id: c.id,
    statement: c.statement,
    item_type: c.item_type,
    subject: c.subject,
    strand: c.strand,
    rubric: c.rubric || null,
    generator: c.generator || null,
    isNew: true,
    interleaved: false,
  };
}

/**
 * ~25% blocked on today's new procedure, ~75% interleaved with at least a
 * quarter drawn from topics last seen 14+ days ago. Rohrer's classroom trial
 * interleaved roughly a third of assignments and still got d = 0.83 — 100%
 * is not required, and blocked acquisition on day zero is the right shape.
 */
function buildPractice(reviewItems, newComponents, count, keyStage) {
  const blockedCount = Math.max(1, Math.round(count * 0.25));
  const blocked = [];
  for (let i = 0; i < blockedCount && newComponents.length; i++) {
    const c = newComponents[i % newComponents.length];
    blocked.push({ ...toPrompt(c), variantSeed: Math.floor(Math.random() * 1e9), interleaved: false });
  }
  const interleaved = reviewItems.slice(0, count - blocked.length);

  // A discrimination item at each family switch: "don't solve it — what kind of
  // problem is this, and what would you do first?" Ten seconds, and it exercises
  // precisely the skill interleaving develops.
  const out = [];
  let lastFamily = null;
  for (const item of [...blocked, ...interleaved]) {
    const family = `${item.subject}:${item.strand || 'general'}`;
    if (lastFamily && family !== lastFamily && out.length % 5 === 0) {
      out.push({
        component_id: item.component_id,
        item_type: 'D',
        discrimination: true,
        statement: item.statement,
        prompt: `Don't solve it — just tell me what kind of problem this is and what you'd do first.`,
      });
    }
    out.push(item);
    lastFamily = family;
  }
  return out;
}

/**
 * Audio in 2–3 minute segments with a checkpoint between them, never one long
 * file. The checkpoint questions are the prequestions, so the child hears the
 * answer to a question they have already tried to answer.
 */
function buildAudioSegments(lesson, count) {
  const objectives = lesson.objectives || [];
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    minutes: i === 0 ? 3 : 2,
    focus: objectives[i] || objectives[0] || lesson.title,
    brief: `Segment ${i + 1} of ${count} on "${lesson.title}". Cover: ${objectives[i] || lesson.title}. `
      + `Anchor it in something physical. Name the technical term only after the idea has landed.`,
  }));
}

function buildReading(lesson) {
  return {
    title: lesson.title,
    keyPoints: (lesson.objectives || []).map((o) => o.replace(/^I can /i, '')),
    vocabulary: lesson.vocabulary || [],
    misconceptions: lesson.misconceptions || [],
    selfPaced: true,
  };
}

/**
 * A component becomes eligible once every prerequisite has stability >= 7.
 * Not full mastery — that would stall everything — but enough that the child
 * isn't pushed into ratio before fractions hold.
 */
async function prerequisitesMet(env, child, component) {
  const prereqs = component.prereq_ids || component.prereqIds;
  if (!prereqs || !prereqs.length) return true;
  const list = Array.isArray(prereqs) ? prereqs : [];
  if (!list.length) return true;

  const placeholders = list.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT component_id, stability FROM srs_card
     WHERE child_id = ? AND component_id IN (${placeholders})`
  ).bind(child.id, ...list).all();

  const byId = new Map((rows.results || []).map((r) => [r.component_id, r.stability]));
  return list.every((p) => (byId.get(p) || 0) >= 7);
}

export { TEMPLATES };
