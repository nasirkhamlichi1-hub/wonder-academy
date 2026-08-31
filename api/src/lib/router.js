// The Wonder Academy — Cloudflare Worker.
// Serves the app, the curriculum, and the API.

import { json, err, id, now, dayKey, parseJson, corsHeaders, sha256Hex, randomHex } from './util.js';
import {
  childLogin, parentLogin, logout, authenticate, authenticateCoach, bootstrap, publicChild,
} from './auth.js';
import { buildSession } from './session.js';
import { recordReview, runGovernor, makeScheduler, seedFromPlacement } from './srs.js';
import { gradeAnswer } from './grade.js';
import { mintToken, postCallWebhook, buildOverrides, buildDynamicVariables } from './voice.js';
import { loadCurriculum, targetLatency } from './curriculum.js';
import { childSummary, curriculumMap, atRiskQuestions, rebuildRollup } from './analytics.js';

/**
 * The API. Framework-free on purpose: the same `route()` runs behind Azure
 * Functions today and could run anywhere that speaks Request/Response.
 */
export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  const cors = corsHeaders(origin, allowed);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Static Web Apps serves the site and the API from one origin, so `ctx` only
  // ever carries deferred work.
  const deferred = [];
  const ctx = { waitUntil: (p) => deferred.push(p) };

  try {
    const res = await route(request, env, ctx, url, path);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    // Managed Functions are billed per invocation and killed when it returns, so
    // deferred work has to finish before we answer.
    if (deferred.length) await Promise.allSettled(deferred);
    return res;
  } catch (e) {
    console.error(e);
    return err(`server error: ${e.message}`, 500, cors);
  }
}

/**
 * Nightly maintenance. Static Web Apps' managed Functions cannot have timer
 * triggers, so this is called by an HTTP endpoint that a scheduled GitHub
 * Actions workflow pokes.
 */
export async function runNightly(env) {
  const children = await env.DB.prepare(`SELECT * FROM children WHERE active = 1`).all();
  const yesterday = dayKey(Date.now() - 86400000);
  const governed = [];
  for (const child of children.results || []) {
    await rebuildRollup(env, child, yesterday);
    await rebuildRollup(env, child, dayKey());
    const change = await runGovernor(env, child);
    if (change) governed.push({ child: child.id, ...change });
  }
  await env.DB.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`).bind(now()).run();
  await env.DB.prepare(`DELETE FROM rate_limit WHERE expires_at < ?`).bind(now()).run();
  return { ok: true, children: (children.results || []).length, governed };
}

async function route(request, env, ctx, url, path) {
  const method = request.method;

  // ─────────────── public ───────────────
  if (path === '/api/health') {
    return json({ ok: true, time: now(), version: env.APP_VERSION || 'dev' });
  }

  if (path === '/api/children' && method === 'GET') {
    // Names and colours only — the login screen needs to show who can log in.
    const rows = await env.DB.prepare(
      `SELECT id, display_name, year_group, colour FROM children WHERE active = 1`).all();
    return json({ children: (rows.results || []).map((r) => ({
      id: r.id, name: r.display_name, year_group: r.year_group, colour: r.colour,
    })) });
  }

  if (path === '/api/auth/child/login' && method === 'POST') return childLogin(request, env);
  if (path === '/api/auth/parent/login' && method === 'POST') return parentLogin(request, env);
  if (path === '/api/auth/logout' && method === 'POST') return logout(request, env);

  if (path === '/api/voice/webhook' && method === 'POST') return postCallWebhook(request, env);

  // Called by the scheduled GitHub Actions workflow — managed Functions have no
  // timer trigger of their own.
  if (path === '/api/rollup' && method === 'POST') {
    const secret = request.headers.get('x-rollup-secret');
    if (!env.ROLLUP_SECRET || !secret || secret !== env.ROLLUP_SECRET) {
      return err('unauthorised', 401);
    }
    return json(await runNightly(env));
  }

  // Warms this instance and the database connection pool before a child taps
  // "start" — the frontend calls it on page load.
  if (path === '/api/ping') {
    await env.DB.prepare(`SELECT 1 AS ok`).first();
    return json({ ok: true });
  }

  // ─────────────── admin ───────────────
  if (path === '/api/admin/bootstrap' && method === 'POST') {
    if (!(await authenticateCoach(request, env))) return err('unauthorised', 401);
    return bootstrap(request, env);
  }

  if (path === '/api/admin/load-components' && method === 'POST') {
    if (!(await authenticateCoach(request, env))) return err('unauthorised', 401);
    return loadComponents(request, env);
  }

  // ─────────────── coach ───────────────
  if (path.startsWith('/api/coach/')) {
    if (!(await authenticateCoach(request, env))) return err('unauthorised', 401);
    return coachRoutes(request, env, url, path);
  }

  // ─────────────── authenticated ───────────────
  const auth = await authenticate(request, env);
  if (!auth) return err('unauthorised', 401);

  if (path === '/api/auth/me') {
    return json(auth.type === 'child'
      ? { type: 'child', child: publicChild(auth.child) }
      : { type: 'parent' });
  }

  // ---- child: what today looks like ----
  //
  // The home screen needs real content or it is two grey boxes. This is the
  // cheapest honest answer to "what am I actually doing today": the subjects
  // this child studies, how much of each is genuinely held, and which of the
  // day's sittings are already done.
  if (path === '/api/child/today' && method === 'GET') {
    if (auth.type !== 'child') return err('child session required', 403);
    const child = auth.child;
    const curriculum = await loadCurriculum(env, child.curriculum_id);

    const counts = await env.DB.prepare(
      `SELECT c.subject AS subject,
              COUNT(*) AS total,
              SUM(CASE WHEN s.mastered = 1 THEN 1 ELSE 0 END) AS held,
              SUM(CASE WHEN s.due IS NOT NULL AND s.due <= ? THEN 1 ELSE 0 END) AS due,
              SUM(CASE WHEN s.reps > 0 THEN 1 ELSE 0 END) AS met
         FROM component c
         LEFT JOIN srs_card s ON s.component_id = c.id AND s.child_id = ?
        WHERE c.curriculum_id = ?
        GROUP BY c.subject`
    ).bind(now(), child.id, child.curriculum_id).all();

    const by = new Map((counts.results || []).map((r) => [r.subject, r]));
    const subjects = (curriculum.subjects || []).map((s) => {
      const r = by.get(s.id) || {};
      const total = Number(r.total) || 0;
      return {
        id: s.id,
        name: s.name,
        short: shortSubject(s.name),
        strand: s.strand,
        board: s.board,
        total,
        met: Number(r.met) || 0,
        held: Number(r.held) || 0,
        due: Number(r.due) || 0,
        progress: total ? (Number(r.held) || 0) / total : 0,
      };
    });

    const doneToday = await env.DB.prepare(
      `SELECT block, completed FROM learning_sessions
        WHERE child_id = ? AND started_at >= ?`
    ).bind(child.id, Date.parse(`${dayKey()}T00:00:00Z`)).all();

    return json({
      child: publicChild(child),
      subjects,
      blocks: [1, 2].map((b) => {
        const rows = (doneToday.results || []).filter((r) => Number(r.block) === b);
        return { block: b, started: rows.length > 0, completed: rows.some((r) => r.completed) };
      }),
      wonders: (await env.DB.prepare(
        `SELECT TOP (3) payload FROM events
          WHERE child_id = ? AND type = 'wonder' ORDER BY created_at DESC`
      ).bind(child.id).all()).results?.map((r) => parseJson(r.payload)?.question).filter(Boolean) || [],
    });
  }

  // ---- child: running a session ----
  if (path === '/api/session/start' && method === 'POST') {
    if (auth.type !== 'child') return err('child session required', 403);
    const body = await request.json().catch(() => ({}));
    const plan = await buildSession(env, auth.child, {
      block: body.block || 1, subject: body.subject || null,
    });
    if (plan.error) return err(plan.error, 409);

    await env.DB.prepare(
      `INSERT INTO learning_sessions
        (id, child_id, block, subject, lesson_id, plan_json, started_at, phase, device)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(plan.id, auth.child.id, plan.block, plan.lesson.subject, plan.lesson.id,
      JSON.stringify(plan), now(), 'warmup',
      request.headers.get('user-agent')).run();

    await env.DB.prepare(
      `INSERT INTO lesson_attempts
        (id, session_id, child_id, lesson_id, curriculum_v, subject, term_id, week, status, started_at)
       VALUES (?,?,?,?,?,?,?,?, 'in_progress', ?)`
    ).bind(id('att_'), plan.id, auth.child.id, plan.lesson.id, auth.child.curriculum_id,
      plan.lesson.subject, plan.lesson.termName || null, plan.lesson.week || null, now()).run();

    // The child never sees these.
    const { dueCount, overflowCount, ...childSafe } = plan;

    return json({
      session: childSafe,
      voice: {
        overrides: buildOverrides(auth.child, plan),
        dynamicVariables: buildDynamicVariables(auth.child, plan),
        asrKeywords: plan.asrKeywords,
      },
    });
  }

  if (path === '/api/session/heartbeat' && method === 'POST') {
    const { session_id, active_ms_delta = 0, phase } = await request.json().catch(() => ({}));
    if (!session_id) return err('session_id required');
    await env.DB.prepare(
      `UPDATE learning_sessions SET active_ms = active_ms + ?, phase = COALESCE(?, phase)
       WHERE id = ? AND child_id = ?`
    ).bind(active_ms_delta, phase || null, session_id, auth.child?.id || '').run();
    return json({ ok: true });
  }

  if (path === '/api/session/end' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.session_id) return err('session_id required');
    await env.DB.prepare(
      `UPDATE learning_sessions SET ended_at = ?, completed = ?, phase = 'done' WHERE id = ? AND child_id = ?`
    ).bind(now(), body.completed ? 1 : 0, body.session_id, auth.child.id).run();
    await env.DB.prepare(
      `UPDATE lesson_attempts SET status = ?, completed_at = ?, teach_back = ?, wonder_note = ?
       WHERE session_id = ?`
    ).bind(body.completed ? 'completed' : 'abandoned', now(),
      body.teach_back || null, body.wonder || null, body.session_id).run();
    ctx.waitUntil(rebuildRollup(env, auth.child));
    return json({ ok: true });
  }

  // ---- the hot path: the voice agent submitting an answer ----
  if (path === '/api/answer' && method === 'POST') {
    if (auth.type !== 'child') return err('child session required', 403);
    return submitAnswer(request, env, auth.child);
  }

  if (path === '/api/wonder' && method === 'POST') {
    const { question, session_id } = await request.json().catch(() => ({}));
    if (!question) return err('question required');
    await env.DB.prepare(
      `INSERT INTO events (child_id, type, payload, created_at) VALUES (?,?,?,?)`
    ).bind(auth.child.id, 'wonder', JSON.stringify({ question, session_id }), now()).run();
    return json({ ok: true });
  }

  if (path === '/api/voice/token' && method === 'POST') return mintToken(request, env, auth);

  // ---- placement probe ----
  if (path === '/api/placement/submit' && method === 'POST') {
    if (auth.type !== 'child') return err('child session required', 403);
    const { results = [] } = await request.json().catch(() => ({}));
    const curriculum = await loadCurriculum(env, auth.child.curriculum_id);
    let seeded = 0;
    for (const r of results) {
      const comp = curriculum.componentById.get(r.component_id);
      if (!comp) continue;
      const fields = seedFromPlacement(
        { passedUnaided: !!r.passed_unaided, fastUnaided: !!r.fast_unaided });
      await env.DB.prepare(
        `IF NOT EXISTS (SELECT 1 FROM srs_card WHERE child_id = ? AND component_id = ?)
         INSERT INTO srs_card
          (child_id, component_id, subject, strand, item_type, due, stability, difficulty,
           elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, seeded)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(auth.child.id, comp.id,
        auth.child.id, comp.id, comp.subject, comp.strand || null, comp.item_type,
        fields.due, fields.stability, fields.difficulty, fields.elapsed_days,
        fields.scheduled_days, fields.learning_steps, fields.reps, fields.lapses,
        fields.state, fields.last_review, fields.seeded).run();
      if (fields.seeded) seeded++;
    }
    return json({ ok: true, seeded, total: results.length });
  }

  // ---- parent ----
  if (path.startsWith('/api/parent/')) {
    if (auth.type !== 'parent') return err('parent session required', 403);
    return parentRoutes(request, env, url, path);
  }

  return err('not found', 404);
}

// ───────────────────── submitting an answer ─────────────────────

async function submitAnswer(request, env, child) {
  const body = await request.json().catch(() => ({}));
  const {
    session_id, component_id, answer, expected, scaffold_level = 0, latency_ms = null,
    modality = 'voice', phase = 'practice', pretest = false, interleaved = false,
    variant_seed = null, attempt_number = 1, raw_transcript = null,
  } = body;

  if (!component_id) return err('component_id required');

  const curriculum = await loadCurriculum(env, child.curriculum_id);
  const comp = curriculum.componentById.get(component_id);
  if (!comp) return err('unknown component', 404);

  const rubric = comp.rubric || (comp.item_type === 'C' ? {
    question: comp.statement,
    key_points: [{ id: 'kp1', text: comp.statement, weight: 1 }],
    pass_threshold: 0.67,
  } : null);

  const graded = await gradeAnswer(env, {
    component: comp, given: answer, expected, rubric, attemptNumber: attempt_number,
  });

  // The agent should ask again rather than mark a child wrong on a mis-hearing.
  // A clarification is not a hint: the re-answer is graded at scaffold level 0.
  if (graded.action === 'clarify') {
    return json({
      action: 'clarify',
      say: pickClarifier(child),
      correct: null,
    });
  }

  const attempt = await env.DB.prepare(
    `SELECT TOP (1) id FROM lesson_attempts WHERE session_id = ? ORDER BY started_at DESC`
  ).bind(session_id || '').first();

  // A grader that could not reach a verdict must never cost the child a mark.
  // Log it for the parent's review list, leave the schedule untouched, and let
  // the lesson carry on.
  if (graded.action === 'defer') {
    await env.DB.prepare(
      `INSERT INTO question_responses
        (attempt_id, session_id, child_id, component_id, item_type, modality, phase,
         question_text, given, raw_transcript, correct, scaffold_level, latency_ms,
         deferred, pretest, answered_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,1,?,?)`
    ).bind(attempt?.id || null, session_id || null, child.id, component_id, comp.item_type,
      modality, phase, comp.statement, answer ?? null, raw_transcript,
      scaffold_level, latency_ms, pretest ? 1 : 0, now()).run();

    return json({
      action: 'defer',
      correct: null,
      next_move: 'accept_and_move_on',
      note: 'could not mark that one — take it at face value and carry on',
    });
  }

  const inserted = await env.DB.prepare(
    `INSERT INTO question_responses
      (attempt_id, session_id, child_id, component_id, variant_seed, item_type, modality, phase,
       question_text, expected, given, raw_transcript, correct, partial, scaffold_level,
       latency_ms, grader_conf, asr_suspect, deferred, pretest, misconceptions, answered_at)
     OUTPUT INSERTED.id
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    attempt?.id || null, session_id || null, child.id, component_id, variant_seed,
    comp.item_type, modality, phase, comp.statement, expected ?? null,
    answer ?? null, raw_transcript, graded.correct ? 1 : 0, graded.partial ?? null,
    scaffold_level, latency_ms, graded.confidence ?? null,
    graded.asr_suspect ? 1 : 0, graded.action === 'defer' ? 1 : 0, pretest ? 1 : 0,
    JSON.stringify(graded.misconceptions || []), now()
  ).first();

  const review = await recordReview(env, child, {
    ...comp,
    target_latency_ms: targetLatency(comp.item_type, child.key_stage),
  }, {
    correct: graded.correct,
    partial: graded.partial,
    scaffoldLevel: scaffold_level,
    latencyMs: latency_ms,
    modality,
    interleaved,
    pretest,
    responseId: inserted?.id || null,
    graderConf: graded.confidence,
    variantSeen: variant_seed != null,
  });

  // What the agent needs for its very next turn — and nothing more. It must never
  // see the rubric, or it will teach to it.
  return json({
    action: 'grade',
    correct: graded.correct,
    partial: graded.partial,
    misconceptions: graded.misconceptions || [],
    next_move: nextMove(graded, scaffold_level, comp),
    mastered: !!review.mastered,
  });
}

function pickClarifier(child) {
  const options = child.key_stage === 'ks1'
    ? ['Say that again for me?', 'One more time — I did not quite catch it.']
    : ['Say that last bit again for me?', 'I did not catch all of that — run it past me once more?'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Tells the agent where to go next without handing it the answer. The scaffold
 * ladder is the agent's, not ours — we only say which rung.
 */
function nextMove(graded, scaffoldLevel, comp) {
  if (graded.correct) {
    return scaffoldLevel === 0
      ? 'ask_why'          // level 5 of the ladder, after a correct answer
      : 'consolidate_then_move_on';
  }
  if (graded.misconceptions?.length) return 'contrast_the_misconception';
  if (scaffoldLevel >= 6) return 'tell_and_requeue';
  return 'next_scaffold_rung';
}

// ───────────────────── parent ─────────────────────

async function parentRoutes(request, env, url, path) {
  const children = await env.DB.prepare(`SELECT * FROM children WHERE active = 1`).all();

  if (path === '/api/parent/overview') {
    const out = [];
    for (const child of children.results || []) {
      out.push({
        ...(await childSummary(env, child)),
        atRisk: await atRiskQuestions(env, child, 5),
      });
    }
    return json({ children: out });
  }

  const m = path.match(/^\/api\/parent\/child\/([^/]+)\/(\w+)$/);
  if (m) {
    const child = (children.results || []).find((c) => c.id === m[1]);
    if (!child) return err('unknown child', 404);
    if (m[2] === 'summary') return json(await childSummary(env, child));
    if (m[2] === 'map') return json(await curriculumMap(env, child));
    if (m[2] === 'atrisk') return json({ items: await atRiskQuestions(env, child, 10) });
    if (m[2] === 'deferred') {
      const rows = await env.DB.prepare(
        `SELECT TOP (50) * FROM question_responses WHERE child_id = ? AND deferred = 1
         ORDER BY answered_at DESC`).bind(child.id).all();
      return json({ items: rows.results || [] });
    }
    if (m[2] === 'transcripts') {
      const rows = await env.DB.prepare(
        `SELECT TOP (20) id, started_at, duration_s, summary, analysis_json FROM voice_conversations
         WHERE child_id = ? ORDER BY started_at DESC`).bind(child.id).all();
      return json({ items: rows.results || [] });
    }
  }

  return err('not found', 404);
}

// ───────────────────── coach ─────────────────────

async function coachRoutes(request, env, url, path) {
  const children = await env.DB.prepare(`SELECT * FROM children WHERE active = 1`).all();

  if (path === '/api/coach/children') {
    return json({ children: (children.results || []).map(publicChild) });
  }

  if (path === '/api/coach/overview') {
    const out = [];
    for (const child of children.results || []) {
      out.push({
        ...(await childSummary(env, child)),
        atRisk: await atRiskQuestions(env, child, 8),
        map: (await curriculumMap(env, child)).map,
      });
    }
    return json({ generated_at: now(), children: out });
  }

  if (path === '/api/coach/export') {
    const since = Number(url.searchParams.get('since') || 0);
    const [responses, logs, sessions] = await Promise.all([
      env.DB.prepare(`SELECT TOP (5000) * FROM question_responses WHERE answered_at > ? ORDER BY answered_at`).bind(since).all(),
      env.DB.prepare(`SELECT TOP (5000) * FROM review_log WHERE reviewed_at > ? ORDER BY reviewed_at`).bind(since).all(),
      env.DB.prepare(`SELECT TOP (1000) * FROM learning_sessions WHERE started_at > ? ORDER BY started_at`).bind(since).all(),
    ]);
    const lines = [
      ...(sessions.results || []).map((r) => JSON.stringify({ _t: 'session', ...r })),
      ...(responses.results || []).map((r) => JSON.stringify({ _t: 'response', ...r })),
      ...(logs.results || []).map((r) => JSON.stringify({ _t: 'review', ...r })),
    ];
    return new Response(lines.join('\n'), {
      headers: { 'content-type': 'application/x-ndjson' },
    });
  }

  const m = path.match(/^\/api\/coach\/child\/([^/]+)\/(\w+)$/);
  if (m) {
    const child = (children.results || []).find((c) => c.id === m[1]);
    if (!child) return err('unknown child', 404);
    if (m[2] === 'summary') return json(await childSummary(env, child));
    if (m[2] === 'map') return json(await curriculumMap(env, child));
    if (m[2] === 'skills') {
      const rows = await env.DB.prepare(
        `SELECT subject, strand,
                COUNT(*) AS n,
                SUM(CASE WHEN mastered = 1 THEN 1 ELSE 0 END) AS mastered,
                AVG(stability) AS avg_stability,
                SUM(lapses) AS lapses
         FROM srs_card WHERE child_id = ? GROUP BY subject, strand ORDER BY avg_stability ASC`
      ).bind(child.id).all();
      return json({ strands: rows.results || [] });
    }
  }

  return err('not found', 404);
}

// ─────────────── loading the curriculum into the DB ───────────────

/**
 * Mirrors the knowledge components from the static curriculum JSON into the
 * component table, so the coach can query them in SQL. The JSON stays the
 * source of truth.
 */
async function loadComponents(request, env) {
  const { curriculum_id } = await request.json().catch(() => ({}));
  const ids = curriculum_id ? [curriculum_id] : ['year2', 'year7', 'year10'];
  let total = 0;

  for (const cid of ids) {
    const curriculum = await loadCurriculum(env, cid);
    const batch = [];
    for (const [componentId, comp] of curriculum.componentById) {
      const cv = [
        componentId, cid, '2014', comp.subject, comp.strand || null,
        cid === 'year2' ? 'ks1' : cid === 'year7' ? 'ks3' : 'gcse',
        comp.ncRef || comp.specRef || null, comp.item_type, comp.statement,
        comp.lesson_id, comp.termId, comp.week,
        JSON.stringify(comp.prereq_ids || comp.prereqIds || []),
        comp.generator || null,
        comp.rubric ? JSON.stringify(comp.rubric) : null,
        targetLatency(comp.item_type, cid === 'year2' ? 'ks1' : cid === 'year7' ? 'ks3' : 'gcse'),
        now(),
      ];
      batch.push(env.DB.prepare(
        `MERGE component AS t USING (SELECT ? AS id) AS s ON t.id = s.id
         WHEN MATCHED THEN UPDATE SET statement = ?, item_type = ?, lesson_id = ?
         WHEN NOT MATCHED THEN INSERT
          (id, curriculum_id, curriculum_version, subject, strand, key_stage, nc_reference,
           item_type, statement, lesson_id, term_id, week, prereq_ids, generator, rubric,
           target_latency_ms, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`
      ).bind(componentId, comp.statement, comp.item_type, comp.lesson_id, ...cv));
      if (batch.length >= 100) { await env.DB.batch(batch.splice(0)); }
    }
    if (batch.length) await env.DB.batch(batch);
    total += curriculum.componentById.size;
  }
  return json({ ok: true, components: total });
}

/** "GCSE Combined Science: Trilogy" is a mouthful on a tile. */
function shortSubject(name) {
  return String(name || '')
    .replace(/^GCSE\s+/i, '')
    .replace(/^KS\d\s+/i, '')
    .replace(/:\s*Trilogy$/i, '')
    .replace(/^Mathematics$/i, 'Maths')
    .trim();
}
