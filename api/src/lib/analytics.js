// The numbers that go to the parent and to the coach.
//
// The headline is delayed accuracy — percent correct on items whose last
// successful review was 14+ days ago. Every other accuracy figure is inflated by
// recency. Immediate post-lesson score is the trap: in the classic experiment,
// restudy BEAT testing at five minutes and lost by fourteen points at a week. If
// you show a parent one number and it is immediate accuracy, you will optimise
// the whole system in the wrong direction.

import { DAY_MS, dayKey, parseJson } from './util.js';
import { loadCurriculum } from './curriculum.js';

export async function childSummary(env, child, { from, to } = {}) {
  const at = Date.now();
  const since = from || at - 30 * DAY_MS;
  const until = to || at;

  const [cards, delayed, unaided, leeches, wonder, recentSessions] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN stability >= 21 THEN 1 ELSE 0 END) AS mature,
              SUM(CASE WHEN mastered = 1 THEN 1 ELSE 0 END) AS mastered,
              SUM(CASE WHEN state = 3 THEN 1 ELSE 0 END) AS relearning
       FROM srs_card WHERE child_id = ?`).bind(child.id).first(),

    // Delayed accuracy: only reviews where the gap since the last successful
    // review was at least 14 days.
    env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS ok
       FROM review_log
       WHERE child_id = ? AND reviewed_at BETWEEN ? AND ? AND elapsed_days >= 14`
    ).bind(child.id, since, until).first(),

    env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN scaffold_level = 0 THEN 1 ELSE 0 END) AS unaided
       FROM review_log WHERE child_id = ? AND reviewed_at BETWEEN ? AND ?`
    ).bind(child.id, since, until).first(),

    // A component with five or more lapses is almost always a badly written
    // item, not a struggling child.
    env.DB.prepare(
      `SELECT TOP (8) component_id, lapses, stability, subject FROM srs_card
       WHERE child_id = ? AND lapses >= 3 ORDER BY lapses DESC`
    ).bind(child.id).all(),

    env.DB.prepare(
      `SELECT TOP (5) payload, created_at FROM events
       WHERE child_id = ? AND type = 'wonder' ORDER BY created_at DESC`
    ).bind(child.id).all(),

    env.DB.prepare(
      `SELECT TOP (20) id, subject, lesson_id, started_at, ended_at, active_ms, completed
       FROM learning_sessions WHERE child_id = ? AND started_at >= ?
       ORDER BY started_at DESC`
    ).bind(child.id, since).all(),
  ]);

  const delayedN = delayed?.n || 0;
  const delayedAccuracy = delayedN ? (delayed.ok || 0) / delayedN : null;

  // Calibration: how far actual pass rate on due reviews sits from the retention
  // we asked for. Should hover near zero. A persistent negative means the
  // parameters or the items are wrong, not the child.
  const calibration = delayedAccuracy == null
    ? null : Number((delayedAccuracy - child.request_retention).toFixed(3));

  return {
    child: { id: child.id, name: child.display_name, year_group: child.year_group },
    window: { from: since, to: until },
    knownAndStillKnown: cards?.mature || 0,
    componentsTracked: cards?.total || 0,
    mastered: cards?.mastered || 0,
    relearning: cards?.relearning || 0,
    delayedAccuracy: delayedAccuracy == null ? null : Number(delayedAccuracy.toFixed(3)),
    delayedSample: delayedN,
    targetBand: [0.85, 0.92],
    calibrationError: calibration,
    unaidedFirstAttemptRate: unaided?.n
      ? Number(((unaided.unaided || 0) / unaided.n).toFixed(3)) : null,
    atRisk: (leeches.results || []).map((r) => ({
      component_id: r.component_id, subject: r.subject, lapses: r.lapses,
      stability: Number((r.stability || 0).toFixed(1)),
    })),
    wonderMoments: (wonder.results || []).map((r) => ({
      question: parseJson(r.payload, {}).question, at: r.created_at,
    })),
    recentSessions: recentSessions.results || [],
  };
}

/** The curriculum map: every strand, coloured by state. Answers "are they on track". */
export async function curriculumMap(env, child) {
  const curriculum = await loadCurriculum(env, child.curriculum_id);
  const rows = await env.DB.prepare(
    `SELECT component_id, mastered, stability, state, lapses FROM srs_card WHERE child_id = ?`
  ).bind(child.id).all();
  const byId = new Map((rows.results || []).map((r) => [r.component_id, r]));

  const map = {};
  for (const [cid, comp] of curriculum.componentById) {
    const key = comp.subject;
    map[key] ||= { subject: key, terms: {} };
    const term = comp.termId || 'unknown';
    map[key].terms[term] ||= { total: 0, mastered: 0, inProgress: 0, lapsed: 0, notStarted: 0 };
    const bucket = map[key].terms[term];
    bucket.total++;

    const card = byId.get(cid);
    if (!card) bucket.notStarted++;
    else if (card.mastered) bucket.mastered++;
    else if (card.state === 3 || card.lapses >= 2) bucket.lapsed++;
    else bucket.inProgress++;
  }

  return {
    child: child.id,
    curriculum: child.curriculum_id,
    subjects: curriculum.subjects,
    map,
  };
}

/** The at-risk panel — with the literal questions, so they can be asked at dinner. */
export async function atRiskQuestions(env, child, limit = 5) {
  const curriculum = await loadCurriculum(env, child.curriculum_id);
  const rows = await env.DB.prepare(
    `SELECT TOP (?) component_id, lapses, stability, subject FROM srs_card
     WHERE child_id = ? AND suspended = 0
     ORDER BY lapses DESC, stability ASC`
  ).bind(limit, child.id).all();

  return (rows.results || []).map((r) => {
    const comp = curriculum.componentById.get(r.component_id);
    return {
      component_id: r.component_id,
      subject: r.subject,
      question: comp?.rubric?.question || comp?.statement || r.component_id,
      lapses: r.lapses,
      stability: Number((r.stability || 0).toFixed(1)),
    };
  });
}

/** Nightly rollup. Also what the coach reads first. */
export async function rebuildRollup(env, child, day = dayKey()) {
  const start = Date.parse(`${day}T00:00:00+04:00`);
  const end = start + DAY_MS;

  const [resp, logs, sessions, cards] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(correct) AS ok,
              SUM(CASE WHEN scaffold_level = 0 THEN 1 ELSE 0 END) AS unaided
       FROM question_responses WHERE child_id = ? AND answered_at >= ? AND answered_at < ?`
    ).bind(child.id, start, end).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN elapsed_days >= 14 THEN 1 ELSE 0 END) AS delayed_n,
              SUM(CASE WHEN elapsed_days >= 14 AND rating > 1 THEN 1 ELSE 0 END) AS delayed_ok,
              SUM(CASE WHEN state_before = 0 THEN 1 ELSE 0 END) AS introduced
       FROM review_log WHERE child_id = ? AND reviewed_at >= ? AND reviewed_at < ?`
    ).bind(child.id, start, end).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(active_ms) AS ms,
              SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done
       FROM learning_sessions WHERE child_id = ? AND started_at >= ? AND started_at < ?`
    ).bind(child.id, start, end).first(),
    env.DB.prepare(
      `SELECT SUM(CASE WHEN stability >= 21 THEN 1 ELSE 0 END) AS mature,
              SUM(CASE WHEN due < ? THEN 1 ELSE 0 END) AS due
       FROM srs_card WHERE child_id = ? AND suspended = 0`
    ).bind(end, child.id).first(),
  ]);

  await env.DB.prepare(
    `MERGE daily_rollup AS t
     USING (SELECT ? AS child_id, ? AS day) AS s
       ON t.child_id = s.child_id AND t.day = s.day
     WHEN MATCHED THEN UPDATE SET
       active_ms = ?, sessions = ?, lessons_completed = ?, items_answered = ?,
       items_correct = ?, unaided_answered = ?, reviews_due = ?, reviews_done = ?,
       new_introduced = ?, mature_items = ?, delayed_correct = ?, delayed_answered = ?
     WHEN NOT MATCHED THEN INSERT
      (child_id, day, active_ms, sessions, lessons_completed, items_answered, items_correct,
       unaided_answered, reviews_due, reviews_done, new_introduced, mature_items,
       delayed_correct, delayed_answered)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?);`
  ).bind(
    child.id, day,
    sessions?.ms || 0, sessions?.n || 0, sessions?.done || 0,
    resp?.n || 0, resp?.ok || 0, resp?.unaided || 0,
    cards?.due || 0, logs?.n || 0, logs?.introduced || 0, cards?.mature || 0,
    logs?.delayed_ok || 0, logs?.delayed_n || 0,
    child.id, day,
    sessions?.ms || 0, sessions?.n || 0, sessions?.done || 0,
    resp?.n || 0, resp?.ok || 0, resp?.unaided || 0,
    cards?.due || 0, logs?.n || 0, logs?.introduced || 0, cards?.mature || 0,
    logs?.delayed_ok || 0, logs?.delayed_n || 0
  ).run();

  return { day, ok: true };
}
