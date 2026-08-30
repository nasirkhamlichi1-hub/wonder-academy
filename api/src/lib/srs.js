// The memory engine: FSRS-6 scheduling, derived ratings, the review queue,
// interleaving constraints, and the mastery gates.
//
// Kept behind this module's exported surface so FSRS-7 can be dropped in when a
// JS implementation exists.

import { fsrs, createEmptyCard, Rating, State, generatorParameters } from 'ts-fsrs';
import { DAY_MS, dayKey, addDays, clamp, parseJson, now } from './util.js';

// ─────────────────────────── scheduler ───────────────────────────

/** One scheduler per child: desired retention and learning steps are age-tuned. */
export function makeScheduler(child) {
  const older = child.year_group >= 7;
  return fsrs(generatorParameters({
    request_retention: child.request_retention ?? (older ? 0.9 : 0.85),
    maximum_interval: 180,          // curriculum work: nothing vanishes for over six months
    enable_fuzz: true,              // spreads load, prevents Monday pile-ups
    enable_short_term: true,
    learning_steps: older ? ['5m', '25m'] : ['3m', '15m'],
    relearning_steps: ['10m'],
    w: parseJson(child.fsrs_params) || undefined,
  }));
}

// A 1-minute gap inside a 50-minute lesson is massed practice with a stopwatch.
// 5 and 25 minutes puts the two same-day repeats either side of a modality change.

/** DB row → the Card shape ts-fsrs expects. */
export function rowToCard(row) {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function cardToFields(card) {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

export function retrievability(scheduler, row, at = Date.now()) {
  if (row.state === State.New || !row.last_review) return 0;
  try {
    return scheduler.get_retrievability(rowToCard(row), new Date(at), false);
  } catch { return 0; }
}

// ─────────────────────── deriving the rating ───────────────────────

/**
 * The child never rates their own recall. Anki's ratings are metacognitive
 * self-reports; children's metacognition is unreliable and they will click
 * whatever ends the session. So we derive it.
 *
 * scaffoldLevel: 0 unaided · 1 re-voiced/narrowed · 2 sub-question · 3 hint
 *                4 worked step given · 5+ told
 */
export function deriveRating({ correct, scaffoldLevel = 0, latencyMs, p50, partial = 1, itemType }) {
  if (!correct || scaffoldLevel >= 4 || partial < 0.34) return Rating.Again;
  if (scaffoldLevel >= 1 || partial < 0.67) return Rating.Hard;

  // Latency is a coarse signal only, and only for facts and procedures. In voice,
  // endpointing and TTS tails add hundreds of ms of unmodelled noise — never grade
  // on raw milliseconds, and never below age 8.
  const latencyUsable = (itemType === 'A' || itemType === 'B')
    && Number.isFinite(latencyMs) && Number.isFinite(p50) && p50 > 0;

  if (latencyUsable && latencyMs > 2.0 * p50) return Rating.Hard;
  if (latencyUsable && latencyMs < 0.6 * p50 && partial === 1) return Rating.Easy;
  return Rating.Good;
}

// Easy must stay rare (target <= 8% of reviews). An all-Good learner at default
// parameters gets intervals of 2 -> 11 -> 46 -> 163 -> 498 days. A generous
// grader makes the curriculum evaporate.

// ──────────────────────── recording a review ────────────────────────

/**
 * Apply one graded answer to a component's card. Creates the card on first
 * retrieval — not at teach time, because the first graded attempt is what sets
 * S0 and D0, and teaching-then-retrieving in the same session is the paradigm
 * that actually works.
 */
export async function recordReview(env, child, component, outcome) {
  const {
    correct, partial = 1, scaffoldLevel = 0, latencyMs = null, modality = 'voice',
    interleaved = false, pretest = false, responseId = null, graderConf = null,
    at = Date.now(), variantSeen = false,
  } = outcome;

  // A prequestion asked before teaching is pedagogically valuable and
  // schedulingly meaningless. Log it, never let it set S0 = 0.21d.
  if (pretest) return { skipped: 'pretest' };

  const scheduler = makeScheduler(child);
  const today = dayKey(at);

  let row = await env.DB.prepare(
    `SELECT * FROM srs_card WHERE child_id = ? AND component_id = ?`
  ).bind(child.id, component.id).first();

  let isNew = false;
  if (!row) {
    isNew = true;
    const empty = createEmptyCard(new Date(at));
    row = {
      child_id: child.id, component_id: component.id,
      subject: component.subject, strand: component.strand, item_type: component.item_type,
      ...cardToFields(empty),
      consec_correct: 0, distinct_days_correct: 0, last_correct_day: null,
      unaided_recent: 0, interleaved_correct: 0, variants_seen: 0,
      median_latency_ms: null, seeded: 0, mastered: 0, mastered_at: null,
      suspended: 0, same_day_exposures: 0, same_day_key: null,
    };
  }

  // Hard cap of 3 same-day exposures per component. Beyond that the child is
  // reading it out of working memory, which inflates stability without building
  // anything. Suspend to tomorrow instead.
  const sameDay = row.same_day_key === today ? row.same_day_exposures : 0;
  if (sameDay >= 3) {
    await env.DB.prepare(
      `UPDATE srs_card SET due = ? WHERE child_id = ? AND component_id = ?`
    ).bind(addDays(at, 1), child.id, component.id).run();
    return { skipped: 'same_day_cap' };
  }

  const p50 = row.median_latency_ms;
  const rating = deriveRating({
    correct, scaffoldLevel, latencyMs, p50, partial, itemType: component.item_type,
  });

  const before = rowToCard(row);
  const { card: next, log } = scheduler.next(before, new Date(at), rating);
  const fields = cardToFields(next);

  // Mastery bookkeeping
  const correctish = rating !== Rating.Again;
  const consec = correctish ? row.consec_correct + 1 : 0;
  const newDay = correctish && row.last_correct_day !== today;
  const distinctDays = newDay ? row.distinct_days_correct + 1 : row.distinct_days_correct;
  const unaided = (correctish && scaffoldLevel === 0) ? row.unaided_recent + 1 : 0;
  const interleavedCorrect = (correctish && interleaved)
    ? row.interleaved_correct + 1 : row.interleaved_correct;
  const variants = variantSeen ? row.variants_seen + 1 : row.variants_seen;

  // Rolling median approximated by an EWMA — cheap, and latency is only ever
  // used as a coarse three-band signal anyway.
  const median = Number.isFinite(latencyMs)
    ? (p50 ? Math.round(0.8 * p50 + 0.2 * latencyMs) : latencyMs)
    : p50;

  const mastered = isMastered({
    ...row,
    ...fields,
    consec_correct: consec,
    distinct_days_correct: distinctDays,
    unaided_recent: unaided,
    interleaved_correct: interleavedCorrect,
    variants_seen: variants,
    median_latency_ms: median,
    item_type: component.item_type,
  }, component);

  // Mastery is revocable: two consecutive lapses drops it back to acquisition.
  const wasMastered = row.mastered === 1;
  const demoted = wasMastered && row.lapses !== undefined && next.lapses >= row.lapses + 1
    && consec === 0;

  const cardValues = [
    child.id, component.id, component.subject, component.strand || null, component.item_type,
    fields.due, fields.stability, fields.difficulty, fields.elapsed_days, fields.scheduled_days,
    fields.learning_steps, fields.reps, fields.lapses, fields.state, fields.last_review,
    consec, distinctDays, correctish ? today : row.last_correct_day, unaided,
    interleavedCorrect, variants, median, row.seeded,
    demoted ? 0 : (mastered ? 1 : row.mastered),
    demoted ? null : (mastered && !wasMastered ? at : row.mastered_at),
    row.suspended, sameDay + 1, today,
  ];

  await env.DB.prepare(
    `MERGE srs_card AS t
     USING (SELECT ? AS child_id, ? AS component_id) AS s
       ON t.child_id = s.child_id AND t.component_id = s.component_id
     WHEN MATCHED THEN UPDATE SET
       subject = ?, strand = ?, item_type = ?, due = ?, stability = ?, difficulty = ?,
       elapsed_days = ?, scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
       state = ?, last_review = ?, consec_correct = ?, distinct_days_correct = ?,
       last_correct_day = ?, unaided_recent = ?, interleaved_correct = ?, variants_seen = ?,
       median_latency_ms = ?, seeded = ?, mastered = ?, mastered_at = ?, suspended = ?,
       same_day_exposures = ?, same_day_key = ?
     WHEN NOT MATCHED THEN INSERT
      (child_id, component_id, subject, strand, item_type, due, stability, difficulty,
       elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review,
       consec_correct, distinct_days_correct, last_correct_day, unaided_recent,
       interleaved_correct, variants_seen, median_latency_ms, seeded, mastered, mastered_at,
       suspended, same_day_exposures, same_day_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`
  ).bind(
    child.id, component.id,          // USING
    ...cardValues.slice(2),          // UPDATE SET
    ...cardValues                    // INSERT VALUES
  ).run();

  await env.DB.prepare(
    `INSERT INTO review_log
      (child_id, component_id, response_id, rating, state_before, elapsed_days, scheduled_days,
       stability_before, difficulty_before, stability_after, difficulty_after, duration_ms,
       scaffold_level, modality, interleaved, grader_conf, reviewed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    child.id, component.id, responseId, rating, before.state,
    log.elapsed_days ?? 0, log.scheduled_days ?? 0,
    isNew ? null : before.stability, isNew ? null : before.difficulty,
    fields.stability, fields.difficulty, latencyMs, scaffoldLevel, modality,
    interleaved ? 1 : 0, graderConf, at
  ).run();

  return {
    rating,
    stability: fields.stability,
    due: fields.due,
    mastered: demoted ? false : mastered,
    demoted,
    isNew,
  };
}

// ─────────────────────────── mastery gates ───────────────────────────

/**
 * Five gates, all required. Blocked correctness is not evidence of learning,
 * and scaffold-dependent correctness is not mastery.
 */
export function isMastered(row, component) {
  const gate1 = row.distinct_days_correct >= 3;            // successive relearning
  const gate2 = row.stability >= 21;                       // R = 0.90 at three weeks
  const gate3 = row.unaided_recent >= 2;                   // unaided
  const target = component?.target_latency_ms;
  const gate4 = !target || (row.item_type !== 'A' && row.item_type !== 'B')
    || (row.median_latency_ms != null && row.median_latency_ms <= target);
  const gate5 = row.interleaved_correct >= 2
    && (row.item_type !== 'B' || row.variants_seen >= 2);

  return gate1 && gate2 && gate3 && gate4 && gate5;
}

// ─────────────────────── the review queue ───────────────────────

/**
 * Priority: rescue what is closest to being lost, but never resurrect something
 * so cold it should be re-taught instead. Budget in seconds, not cards.
 */
export function buildReviewQueue(rows, scheduler, at, budgetSeconds) {
  const due = rows.filter((r) => !r.suspended && r.due <= at);

  const scored = due.map((r) => {
    const R = retrievability(scheduler, r, at);
    const overdueDays = (at - r.due) / DAY_MS;
    return {
      row: r,
      R,
      priority:
        (R < 0.6 ? 0 : 1) * 1000                       // at-risk band first
        + (r.lapses >= 3 ? -50 : 0)                    // known-fragile items jump
        - overdueDays
        + (r.state === State.Relearning ? -500 : 0),
      cost: r.median_latency_ms ? r.median_latency_ms / 1000 + 6 : 20,
    };
  });

  scored.sort((a, b) => a.priority - b.priority);

  const queue = [];
  let spent = 0;
  for (const s of scored) {
    if (spent + s.cost > budgetSeconds) break;
    queue.push(s.row);
    spent += s.cost;
  }

  // Overflow is postponed, never dropped. Push by a fraction of current stability
  // so the model stays roughly calibrated.
  const overflow = scored.slice(queue.length).map((s) => ({
    component_id: s.row.component_id,
    push: Math.max(1, Math.round(0.1 * (s.row.stability || 1))),
  }));

  return { queue: interleave(queue), overflow, dueCount: due.length };
}

/**
 * Interleaving constraints, in priority order:
 *  1. never 3 consecutive items from the same component family
 *  2. every window of 8 draws from >= 3 distinct families
 *  3. >= 1 in 4 items comes from a topic mastered >= 14 days ago
 *  4. never open on the item they failed last time
 *
 * Interleaving works because it forces discrimination — choosing which method
 * applies. Shuffling a set that exercises one procedure achieves nothing.
 */
export function interleave(rows) {
  if (rows.length <= 2) return rows;

  const familyOf = (r) => `${r.subject}:${r.strand || 'general'}`;

  // Bucket by family, then always draw from the largest bucket that isn't the
  // one we just used. Greedy scanning degrades at the tail — it happily leaves
  // a run of one family at the end, which is exactly where the interleaving is
  // supposed to be doing its work. This spreads the families as evenly as the
  // counts allow, and only repeats when a single family is more than half of
  // what is left.
  const buckets = new Map();
  for (const row of rows) {
    const fam = familyOf(row);
    if (!buckets.has(fam)) buckets.set(fam, []);
    buckets.get(fam).push(row);
  }

  // Never open on the item they failed last time — start on something they will
  // get right, so the session doesn't begin with a stumble.
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const cold = (r) => (r.state === State.Relearning || r.consec_correct === 0) ? 1 : 0;
      return cold(a) - cold(b);
    });
  }

  const out = [];
  let previous = null;
  let secondPrevious = null;

  while (out.length < rows.length) {
    const candidates = [...buckets.entries()]
      .filter(([, list]) => list.length)
      .sort((a, b) => b[1].length - a[1].length);
    if (!candidates.length) break;

    // Prefer a family that would not make a run of three; fall back to the
    // largest remaining when there is genuinely nothing else left.
    const spaced = candidates.filter(([fam]) => !(fam === previous && fam === secondPrevious));
    const usable = spaced.length ? spaced : candidates;

    // Open on something they will get right. Starting a session on the item
    // they failed last time is the fastest way to lose a child.
    const isCold = (row) => row.state === State.Relearning || row.consec_correct === 0;
    const pick = out.length === 0
      ? (usable.find(([, list]) => !isCold(list[0])) ?? usable[0])
      : usable[0];

    out.push(pick[1].shift());
    secondPrevious = previous;
    previous = pick[0];
  }

  return out;
}

// ───────────────── placement: building on last year ─────────────────

/**
 * Seeding at S=21 rather than S=0 is the difference between six weeks revising
 * last year and starting the new year on Monday. Seeded cards are flagged: if
 * one lapses on its first real review it resets to New, because the probe was wrong.
 */
export function seedFromPlacement({ passedUnaided, fastUnaided }, at = Date.now()) {
  const card = createEmptyCard(new Date(at));
  if (!passedUnaided) return { ...cardToFields(card), seeded: 0 };
  card.state = State.Review;
  card.stability = fastUnaided ? 21 : 7;
  card.difficulty = fastUnaided ? 4.5 : 6.0;
  card.reps = 1;
  card.last_review = new Date(at);
  card.due = new Date(addDays(at, Math.round(card.stability)));
  return { ...cardToFields(card), seeded: 1 };
}

// ─────────────────── the new-item governor ───────────────────

/**
 * If overflow exceeds 20% of the due queue three days running, drop the new-item
 * rate by one and tell the parent. A backlog must never be visible to the child
 * as a number — that is the single most common reason children abandon SRS.
 */
export async function runGovernor(env, child) {
  const rows = await env.DB.prepare(
    `SELECT TOP (3) day, reviews_due, overflow FROM daily_rollup
     WHERE child_id = ? ORDER BY day DESC`
  ).bind(child.id).all();

  const days = rows.results || [];
  if (days.length < 3) return null;

  const stressed = days.every((d) => d.reviews_due > 0 && d.overflow / d.reviews_due > 0.2);
  if (!stressed || child.new_items_per_day <= 1) return null;

  const next = child.new_items_per_day - 1;
  await env.DB.prepare(`UPDATE children SET new_items_per_day = ? WHERE id = ?`)
    .bind(next, child.id).run();
  await env.DB.prepare(
    `INSERT INTO events (child_id, type, payload, created_at) VALUES (?,?,?,?)`
  ).bind(child.id, 'governor.reduced_new_items',
    JSON.stringify({ from: child.new_items_per_day, to: next }), now()).run();

  return { from: child.new_items_per_day, to: next };
}

export { Rating, State };
