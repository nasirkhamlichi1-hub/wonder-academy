// Child + parent PIN auth, and the coach API key.
//
// PINs are 4 digits. A 4-digit space has 10,000 values, so iteration count buys
// almost nothing against a stolen database — the real defence is the server-side
// pepper (a Worker secret, never stored in D1) plus rate limiting. PBKDF2 at a
// meaningful work factor would also blow the free plan's 10ms CPU budget.

import { json, err, id, now, sha256Hex, hashPin, randomHex, safeEqual } from './util.js';

const SESSION_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days — children shouldn't re-login daily
const MAX_ATTEMPTS = 5;
const WINDOW_S = 15 * 60;

async function rateLimit(env, key) {
  const k = `pin:${key}`;
  const raw = await env.RATE.get(k);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= MAX_ATTEMPTS) return false;
  await env.RATE.put(k, String(count + 1), { expirationTtl: WINDOW_S });
  return true;
}

async function clearRateLimit(env, key) {
  await env.RATE.delete(`pin:${key}`);
}

async function issueToken(env, subjectType, subjectId, userAgent) {
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  const issued = now();
  const expires = issued + SESSION_MS;
  await env.DB.prepare(
    `INSERT INTO auth_sessions (token_hash, subject_type, subject_id, issued_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(hash, subjectType, subjectId, issued, expires, userAgent || null).run();
  return { token, expires_at: expires };
}

export async function childLogin(request, env) {
  const { child_id, pin } = await request.json().catch(() => ({}));
  if (!child_id || !pin) return err('child_id and pin required');

  if (!(await rateLimit(env, child_id))) {
    return err('Too many attempts. Wait 15 minutes.', 429);
  }

  const child = await env.DB.prepare(
    `SELECT * FROM children WHERE id = ? AND active = 1`).bind(child_id).first();
  if (!child) return err('Unknown child', 401);

  const attempt = await hashPin(String(pin), child.pin_salt, env.PIN_PEPPER);
  if (!safeEqual(attempt, child.pin_hash)) return err('Wrong PIN', 401);

  await clearRateLimit(env, child_id);
  const { token, expires_at } = await issueToken(
    env, 'child', child.id, request.headers.get('user-agent'));

  return json({
    token, expires_at,
    child: publicChild(child),
  });
}

export async function parentLogin(request, env) {
  const { pin } = await request.json().catch(() => ({}));
  if (!pin) return err('pin required');
  if (!(await rateLimit(env, 'parent'))) return err('Too many attempts. Wait 15 minutes.', 429);

  const parent = await env.DB.prepare(`SELECT * FROM parents WHERE id = 'parent'`).first();
  if (!parent) return err('Parent account not set up', 401);

  const attempt = await hashPin(String(pin), parent.pin_salt, env.PIN_PEPPER);
  if (!safeEqual(attempt, parent.pin_hash)) return err('Wrong PIN', 401);

  await clearRateLimit(env, 'parent');
  const { token, expires_at } = await issueToken(
    env, 'parent', 'parent', request.headers.get('user-agent'));
  return json({ token, expires_at });
}

export function publicChild(row) {
  return {
    id: row.id,
    name: row.display_name,
    year_group: row.year_group,
    key_stage: row.key_stage,
    curriculum_id: row.curriculum_id,
    colour: row.colour,
    sessions_per_day: row.sessions_per_day,
    session_minutes: row.session_minutes,          // null = untimed
    new_items_per_day: row.new_items_per_day,
    request_retention: row.request_retention,
  };
}

/** Resolve the bearer token on a request. Returns null when unauthenticated. */
export async function authenticate(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const hash = await sha256Hex(token);

  const session = await env.DB.prepare(
    `SELECT * FROM auth_sessions WHERE token_hash = ? AND revoked = 0 AND expires_at > ?`
  ).bind(hash, now()).first();
  if (!session) return null;

  if (session.subject_type === 'child') {
    const child = await env.DB.prepare(
      `SELECT * FROM children WHERE id = ?`).bind(session.subject_id).first();
    if (!child) return null;
    return { type: 'child', child };
  }
  return { type: 'parent', id: session.subject_id };
}

/** Coach access — a long-lived API key rather than a login. */
export async function authenticateCoach(request, env) {
  const header = request.headers.get('authorization') || '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!key) return false;
  if (env.COACH_API_KEY && safeEqual(key, env.COACH_API_KEY)) return true;

  const hash = await sha256Hex(key);
  const row = await env.DB.prepare(
    `SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0`).bind(hash).first();
  if (!row) return false;
  await env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(now(), row.id).run();
  return true;
}

export async function logout(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    await env.DB.prepare(`UPDATE auth_sessions SET revoked = 1 WHERE token_hash = ?`)
      .bind(await sha256Hex(token)).run();
  }
  return json({ ok: true });
}

/** One-time bootstrap: create the three children and the parent PIN. Admin key only. */
export async function bootstrap(request, env) {
  const body = await request.json().catch(() => ({}));
  const t = now();

  if (body.parent_pin) {
    const salt = randomHex(8);
    const hash = await hashPin(String(body.parent_pin), salt, env.PIN_PEPPER);
    await env.DB.prepare(
      `MERGE parents AS t USING (SELECT 'parent' AS id) AS s ON t.id = s.id
       WHEN MATCHED THEN UPDATE SET pin_hash = ?, pin_salt = ?
       WHEN NOT MATCHED THEN INSERT (id, pin_hash, pin_salt, created_at)
         VALUES ('parent', ?, ?, ?);`
    ).bind(hash, salt, hash, salt, t).run();
  }

  const made = [];
  for (const c of body.children || []) {
    const salt = randomHex(8);
    const hash = await hashPin(String(c.pin), salt, env.PIN_PEPPER);
    await env.DB.prepare(
      `MERGE children AS t USING (SELECT ? AS id) AS s ON t.id = s.id
       WHEN MATCHED THEN UPDATE SET
         display_name = ?, year_group = ?, key_stage = ?, curriculum_id = ?, colour = ?,
         pin_hash = ?, pin_salt = ?, sessions_per_day = ?, session_minutes = ?,
         new_items_per_day = ?, request_retention = ?
       WHEN NOT MATCHED THEN INSERT
        (id, display_name, year_group, key_stage, curriculum_id, colour, pin_hash, pin_salt,
         sessions_per_day, session_minutes, new_items_per_day, request_retention, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);`
    ).bind(
      c.id,
      c.name, c.year_group, c.key_stage, c.curriculum_id, c.colour || null,
      hash, salt, c.sessions_per_day ?? 2, c.session_minutes ?? null,
      c.new_items_per_day ?? 4, c.request_retention ?? 0.9,
      c.id, c.name, c.year_group, c.key_stage, c.curriculum_id, c.colour || null,
      hash, salt, c.sessions_per_day ?? 2, c.session_minutes ?? null,
      c.new_items_per_day ?? 4, c.request_retention ?? 0.9, t
    ).run();
    made.push(c.id);
  }
  return json({ ok: true, children: made });
}
