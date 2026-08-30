// ElevenLabs Agents: minting conversation tokens server-side, and receiving the
// post-call analysis.
//
// The API key lives only here, as a Worker secret. The browser never sees it —
// it receives a short-lived conversation token for one WebRTC session.

import { json, err, id, now, parseJson } from './util.js';
import { buildLessonPrompt, buildFirstMessage } from './prompt.js';

const EL = 'https://api.elevenlabs.io';

/**
 * WebRTC conversation token. WebRTC is the SDK default for voice and handles
 * network adaptation and reconnection — which matters for a child on home wifi.
 */
export async function mintToken(request, env, auth) {
  if (auth?.type !== 'child') return err('child session required', 403);
  const child = auth.child;
  const body = await request.json().catch(() => ({}));
  const agentId = env.ELEVENLABS_AGENT_ID;
  if (!agentId) return err('ELEVENLABS_AGENT_ID not configured', 500);

  const url = new URL(`${EL}/v1/convai/conversation/token`);
  url.searchParams.set('agent_id', agentId);
  url.searchParams.set('participant_name', child.display_name);

  const res = await fetch(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
  if (!res.ok) {
    const text = await res.text();
    return err(`ElevenLabs token request failed: ${res.status} ${text.slice(0, 200)}`, 502);
  }
  const { token, conversation_id } = await res.json();

  await env.DB.prepare(
    `INSERT INTO token_grants (child_id, agent_id, conversation_id, session_id, minted_at, user_agent)
     VALUES (?,?,?,?,?,?)`
  ).bind(child.id, agentId, conversation_id || null, body.session_id || null, now(),
    request.headers.get('user-agent')).run();

  if (conversation_id) {
    await env.DB.prepare(
      `IF NOT EXISTS (SELECT 1 FROM voice_conversations WHERE id = ?)
         INSERT INTO voice_conversations
           (id, child_id, session_id, agent_id, started_at, status)
         VALUES (?,?,?,?,?,'active')`
    ).bind(conversation_id, conversation_id, child.id, body.session_id || null, agentId, now()).run();
  }

  return json({ token, conversation_id, agent_id: agentId });
}

/**
 * The per-session steering: prompt + first message as overrides, plus dynamic
 * variables. Only `prompt` and `first_message` overrides should be enabled on
 * the agent — anything enabled is a surface anyone reaching this endpoint can set.
 */
export function buildOverrides(child, plan) {
  return {
    agent: {
      prompt: { prompt: buildLessonPrompt(child, plan) },
      firstMessage: buildFirstMessage(child, plan),
      language: 'en',
    },
    conversation: { textOnly: false },
  };
}

export function buildDynamicVariables(child, plan) {
  return {
    child_name: child.display_name,
    year_group: String(child.year_group),
    key_stage: child.key_stage,
    subject: plan.lesson.subjectName,
    lesson_title: plan.lesson.title,
    session_id: plan.id,
    // Wait time is set on the agent, but the register block reads this so the
    // model knows how patient to be with this particular child.
    wait_time_seconds: child.key_stage === 'ks1' ? '5' : '3.5',
    untimed: child.session_minutes ? 'false' : 'true',
  };
}

// ───────────────────── post-call webhook ─────────────────────

async function verifySignature(env, signatureHeader, rawBody) {
  if (!env.ELEVENLABS_WEBHOOK_SECRET) return true;      // not configured yet
  if (!signatureHeader) return false;

  // Header shape: "t=<unix>,v0=<hex hmac of `${t}.${body}`>"
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim())));
  const t = parts.t;
  const v0 = parts.v0;
  if (!t || !v0) return false;

  // Reject replays older than 30 minutes.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 1800) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.ELEVENLABS_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === v0;
}

export async function postCallWebhook(request, env) {
  const raw = await request.text();
  const ok = await verifySignature(env, request.headers.get('elevenlabs-signature'), raw);
  if (!ok) return err('bad signature', 401);

  const payload = parseJson(raw, {});
  const data = payload.data || payload;
  const conversationId = data.conversation_id;
  if (!conversationId) return json({ ok: true, skipped: 'no conversation_id' });

  // The agent's own delivered speech can be shorter than what it planned when a
  // child interrupts. Apply the corrections or a transcript shown to a parent
  // will claim the agent said things it never said.
  const transcript = (data.transcript || []).map((turn) => ({
    role: turn.role,
    message: turn.corrected_agent_response ?? turn.message,
    t: turn.time_in_call_secs,
  }));

  const meta = data.metadata || {};
  const analysis = data.analysis || {};

  await env.DB.prepare(
    `UPDATE voice_conversations SET
       ended_at = ?, duration_s = ?, cost_fiat = ?, status = 'done',
       turn_count = ?, transcript_json = ?, summary = ?, analysis_json = ?
     WHERE id = ?`
  ).bind(
    now(), meta.call_duration_secs || null, meta.cost_fiat ?? null,
    transcript.length, JSON.stringify(transcript),
    analysis.transcript_summary || null, JSON.stringify(analysis),
    conversationId
  ).run();

  // An unprompted question from the child is the best proxy we have for the
  // thing this whole product is actually for.
  const collected = analysis.data_collection_results || {};
  const wonder = collected.unprompted_question?.value || collected.wonder_moment?.value;
  if (wonder) {
    const row = await env.DB.prepare(
      `SELECT child_id, session_id FROM voice_conversations WHERE id = ?`).bind(conversationId).first();
    if (row) {
      await env.DB.prepare(
        `INSERT INTO events (child_id, type, payload, created_at) VALUES (?,?,?,?)`
      ).bind(row.child_id, 'wonder', JSON.stringify({ question: wonder, conversationId }), now()).run();
    }
  }

  return json({ ok: true });
}

/** Pull a conversation's detail on demand (parent review, coach). */
export async function fetchConversation(env, conversationId) {
  const res = await fetch(`${EL}/v1/convai/conversations/${conversationId}`, {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}
