// The Wonder Academy — client.
//
// Deliberately not React: the ElevenLabs React wrapper has an open iOS Safari bug
// where client tools never fire, and client tools are the entire mechanism by
// which the lesson advances and answers get marked. The vanilla client is the
// documented way round it.

import { Conversation } from '@elevenlabs/client';

const app = document.getElementById('app');
const whoami = document.getElementById('whoami');
const signout = document.getElementById('signout');

const store = {
  get token() { return localStorage.getItem('wa.token'); },
  set token(v) { v ? localStorage.setItem('wa.token', v) : localStorage.removeItem('wa.token'); },
  get child() { try { return JSON.parse(localStorage.getItem('wa.child')); } catch { return null; } },
  set child(v) { v ? localStorage.setItem('wa.child', JSON.stringify(v)) : localStorage.removeItem('wa.child'); },
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(store.token ? { 'x-wa-auth': `Bearer ${store.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { store.token = null; store.child = null; render(); throw new Error('signed out'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SUBJECT_COLOURS = {
  maths: 'var(--subj-maths)', mathematics: 'var(--subj-maths)',
  english: 'var(--subj-english)', 'english-language': 'var(--subj-english)',
  'english-literature': 'var(--subj-english)',
  science: 'var(--subj-science)', geography: 'var(--subj-geography)',
  history: 'var(--subj-history)', computing: 'var(--subj-computing)',
  business: 'var(--subj-business)', dt: 'var(--subj-dt)',
  'design-technology': 'var(--subj-dt)', discover: 'var(--subj-discover)',
};
const subjectColour = (s) => SUBJECT_COLOURS[s] || 'var(--brand)';

// ───────────────────────────── routing ─────────────────────────────

async function render() {
  const child = store.child;
  document.body.dataset.tier = child?.key_stage || '';
  whoami.classList.toggle('hidden', !child);
  signout.classList.toggle('hidden', !store.token);
  if (child) whoami.textContent = child.name;

  if (!store.token) return viewPickWho();
  if (!child) return viewParentDashboard();
  return viewChildHome();
}

signout.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  store.token = null; store.child = null; render();
});

// ───────────────────────────── login ─────────────────────────────

async function viewPickWho() {
  const { children } = await api('/api/children');
  app.replaceChildren(el(`
    <div>
      <h1 style="margin-top:2rem">Who's learning?</h1>
      <div class="who">
        ${children.map((c) => `
          <button class="who__btn" data-child="${esc(c.id)}">
            <div class="who__dot" style="background:${esc(c.colour || 'var(--brand)')}"></div>
            ${esc(c.name)}
          </button>`).join('')}
        <button class="who__btn" data-child="__parent">
          <div class="who__dot" style="background:var(--storm)"></div>
          Mission Control
        </button>
      </div>
    </div>`));

  app.querySelectorAll('[data-child]').forEach((b) =>
    b.addEventListener('click', () => viewPin(b.dataset.child,
      children.find((c) => c.id === b.dataset.child)?.name || 'Mission Control')));
}

function viewPin(childId, name) {
  const isParent = childId === '__parent';
  let pin = '';
  const view = el(`
    <div class="pinpad">
      <h1 style="text-align:center;margin-top:2rem">${esc(name)}</h1>
      <div class="pinpad__display">${'<div class="pinpad__dot"></div>'.repeat(4)}</div>
      <p class="error hidden" id="pinerr"></p>
      <div class="pinpad__keys">
        ${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="btn" data-k="${n}">${n}</button>`).join('')}
        <button class="btn" data-k="back">←</button>
        <button class="btn" data-k="0">0</button>
        <button class="btn btn--ghost" data-k="cancel">×</button>
      </div>
    </div>`);
  app.replaceChildren(view);

  const dots = view.querySelectorAll('.pinpad__dot');
  const errEl = view.querySelector('#pinerr');
  const paint = () => dots.forEach((d, i) => d.classList.toggle('pinpad__dot--on', i < pin.length));

  view.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.k;
    if (k === 'cancel') return render();
    if (k === 'back') { pin = pin.slice(0, -1); return paint(); }
    if (pin.length >= 4) return;
    pin += k; paint();
    if (pin.length !== 4) return;

    try {
      const body = isParent ? { pin } : { child_id: childId, pin };
      const data = await api(isParent ? '/api/auth/parent/login' : '/api/auth/child/login',
        { method: 'POST', body: JSON.stringify(body) });
      store.token = data.token;
      store.child = data.child || null;
      render();
    } catch (e) {
      errEl.textContent = e.message; errEl.classList.remove('hidden');
      pin = ''; paint();
    }
  }));
}

// ───────────────────────────── child home ─────────────────────────────

async function viewChildHome() {
  const child = store.child;
  const untimed = !child.session_minutes;

  app.replaceChildren(el(`
    <div>
      <p class="breadcrumb">The Wonder Academy</p>
      <h1>Morning, ${esc(child.name)}.</h1>
      <p class="prose">${untimed
        ? `We'll do a few short bits, and stop while you still want more.`
        : `Two sessions today, ${child.session_minutes} minutes each. Your teacher talks — you talk back.`}</p>

      <div class="card-grid" style="margin-top:2rem">
        <div class="card">
          <div class="card__accent"></div>
          <div class="card__body">
            <h2 class="card__title" style="font-size:1.25rem">First session</h2>
            <p class="card__meta">Your teacher picks up where you left off.</p>
            <button class="btn btn--primary btn--big" id="start1" style="width:100%">Start</button>
          </div>
        </div>
        ${untimed ? '' : `
        <div class="card">
          <div class="card__accent" style="background:var(--metal)"></div>
          <div class="card__body">
            <h2 class="card__title" style="font-size:1.25rem">Second session</h2>
            <p class="card__meta">A different subject, later in the day.</p>
            <button class="btn btn--big" id="start2" style="width:100%">Start</button>
          </div>
        </div>`}
      </div>

      <p class="notice">Your teacher is a computer, not a person, and it listens through
      your microphone. Headphones make it work much better.</p>
    </div>`));

  app.querySelector('#start1')?.addEventListener('click', (e) => beginLesson(1, e));
  app.querySelector('#start2')?.addEventListener('click', (e) => beginLesson(2, e));
}

// ───────────────────────────── the lesson ─────────────────────────────

let live = null;   // the running lesson

async function beginLesson(block, event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Getting ready…';

  // Unlock audio inside the same user gesture. iOS will not play the agent's
  // first message otherwise — the output context is still suspended when the
  // first chunk arrives.
  let audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
  } catch { /* not fatal */ }

  try {
    await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    button.disabled = false;
    button.textContent = 'Start';
    app.prepend(el(`<p class="error">I need the microphone to teach out loud. Allow it and try again.</p>`));
    return;
  }

  const { session, voice } = await api('/api/session/start',
    { method: 'POST', body: JSON.stringify({ block }) });

  renderLessonStage(session);
  await connectTeacher(session, voice);
}

function renderLessonStage(session) {
  const child = store.child;
  const lesson = session.lesson;
  const colour = subjectColour(lesson.subject);
  const teachable = session.phases.filter((p) => p.phase !== 'break');

  app.replaceChildren(el(`
    <div>
      <p class="breadcrumb">
        ${esc(child.name)} › ${esc(lesson.subjectName)}${lesson.unit ? ` › ${esc(lesson.unit)}` : ''}
      </p>

      <div class="phase-title">
        <h1 style="--accent:${colour}">${esc(lesson.title)}</h1>
      </div>
      <p>
        ${lesson.specRef ? `<span class="tag tag--board">${esc(lesson.specRef)}</span>` : ''}
        ${lesson.bigRock ? `<span class="tag">Key lesson</span>` : ''}
        ${lesson.termName ? `<span class="tag">${esc(lesson.termName)} · week ${esc(lesson.week)}</span>` : ''}
      </p>

      <div class="phases" id="phases">
        ${teachable.map((p, i) => `<div class="phase-pip" data-i="${i}" title="${esc(p.label)}"></div>`).join('')}
      </div>

      <div class="stage">
        <div id="stagemain">
          <!-- Summary first: a child who reads only this has still learned the thing. -->
          <div class="panel" style="--accent:${colour}">
            <p class="panel__title">Key points</p>
            <ul>${(lesson.objectives || []).map((o) =>
              `<li>${esc(o.replace(/^I can /i, ''))}</li>`).join('')}</ul>
          </div>
          <div id="phasebody"></div>
        </div>

        <aside class="teacher">
          <div class="orb" id="orb"></div>
          <p class="teacher__name">Your teacher</p>
          <p class="teacher__state" id="tstate">Connecting…</p>
          <div id="termcard"></div>
          <button class="btn btn--ghost" id="endlesson" style="width:100%;margin-top:1rem">
            Finish for now
          </button>
        </aside>
      </div>
    </div>`));

  app.querySelector('#endlesson').addEventListener('click', () => endLesson(false));
  setPhase(0, teachable);
}

let phaseIndex = 0;
let phaseList = [];

function setPhase(i, list) {
  phaseList = list || phaseList;
  phaseIndex = Math.min(i, phaseList.length - 1);
  const pips = app.querySelectorAll('.phase-pip');
  pips.forEach((p, n) => {
    p.classList.toggle('phase-pip--done', n < phaseIndex);
    p.classList.toggle('phase-pip--now', n === phaseIndex);
  });

  const phase = phaseList[phaseIndex];
  const body = app.querySelector('#phasebody');
  if (!phase || !body) return;

  const kicker = `<p class="phase-title__kicker">${esc(phase.label)}</p>`;

  if (phase.phase === 'read' && phase.reading) {
    body.innerHTML = kicker + renderReading(phase.reading);
    wireReveals(body);
  } else if (phase.phase === 'teachback') {
    body.innerHTML = kicker + `
      <div class="panel"><p class="panel__title">Over to you</p>
      <p>${esc(phase.prompt)}</p>
      ${phase.sentenceStarter ? `<p><em>You could start: "${esc(phase.sentenceStarter)}…"</em></p>` : ''}
      </div>`;
  } else {
    // Listening, practice and retrieval happen out loud. Showing a transcript of
    // what the teacher is saying makes learning worse, not better — so we show
    // what the phase is, and nothing else.
    body.innerHTML = kicker + `<p class="prose" style="color:var(--cloud-dark)">
      ${esc(phaseHint(phase))}</p>`;
  }
}

function phaseHint(phase) {
  switch (phase.phase) {
    case 'warmup': return 'Things you have met before. Answer out loud — quick as you like.';
    case 'prequestion': return 'Some questions before we start. Getting them wrong is fine — that is the point.';
    case 'listen': return 'Listen. Your teacher will stop and ask you things along the way.';
    case 'new': return 'One new idea.';
    case 'practice': return 'Your turn. These are mixed up on purpose.';
    case 'consolidation': return 'Last few, then one thing to wonder about.';
    default: return '';
  }
}

function renderReading(reading) {
  return `
    <h2>${esc(reading.title)}</h2>
    ${reading.keyPoints?.length ? `<div class="panel"><p class="panel__title">The idea</p>
      <ul>${reading.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
    ${reading.vocabulary?.length ? `<div class="panel panel--vocab"><p class="panel__title">Words</p>
      <ul>${reading.vocabulary.map((v) => `<li><strong>${esc(v)}</strong></li>`).join('')}</ul></div>` : ''}
    ${reading.misconceptions?.length ? `<div class="panel panel--tip"><p class="panel__title">Easy to get wrong</p>
      <ul>${reading.misconceptions.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}`;
}

function wireReveals(root) {
  root.querySelectorAll('.reveal__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      const drawer = root.querySelector(`#${btn.getAttribute('aria-controls')}`);
      if (drawer) drawer.hidden = open;      // hidden, not display — keeps the a11y tree right
    });
  });
}

function showTerm(word, definition) {
  const holder = app.querySelector('#termcard');
  if (!holder) return;
  holder.innerHTML = `<div class="term-card">
      <div class="term-card__word">${esc(word)}</div>
      ${definition ? `<div>${esc(definition)}</div>` : ''}
    </div>`;
}

function setTeacherState(state) {
  const orb = app.querySelector('#orb');
  const label = app.querySelector('#tstate');
  if (!orb || !label) return;
  orb.classList.toggle('orb--speaking', state === 'speaking');
  orb.classList.toggle('orb--listening', state === 'listening');
  label.textContent = {
    speaking: 'Talking', listening: 'Listening', thinking: 'Thinking',
    connecting: 'Connecting…', ended: 'Finished',
  }[state] || '';
}

// ───────────────────── the voice teacher ─────────────────────

async function connectTeacher(session, voice) {
  setTeacherState('connecting');

  const { token } = await api('/api/voice/token',
    { method: 'POST', body: JSON.stringify({ session_id: session.id }) });

  // The scaffold level the teacher has climbed to for the current item. The
  // agent reports it on submit_answer; we keep a copy so a clarification can be
  // regraded at level 0 without the agent having to remember that rule.
  let questionAskedAt = Date.now();
  let attemptNumber = 1;
  let lastComponent = null;

  const clientTools = {
    // Reported after every answer. If this is not called, the item is never
    // scheduled and the child will forget it.
    submit_answer: async (p) => {
      const componentId = p.component_id || lastComponent;
      if (!componentId) return 'no component id — say which item this was';
      attemptNumber = componentId === lastComponent ? attemptNumber + 1 : 1;
      lastComponent = componentId;

      try {
        const r = await api('/api/answer', {
          method: 'POST',
          body: JSON.stringify({
            session_id: session.id,
            component_id: componentId,
            answer: p.answer,
            expected: p.expected,
            scaffold_level: Number(p.scaffold_level) || 0,
            latency_ms: Date.now() - questionAskedAt,
            phase: phaseList[phaseIndex]?.phase || 'practice',
            pretest: p.pretest === true || p.pretest === 'true',
            interleaved: phaseList[phaseIndex]?.phase === 'practice',
            attempt_number: attemptNumber,
            raw_transcript: p.answer,
            modality: 'voice',
          }),
        });
        questionAskedAt = Date.now();

        if (r.action === 'clarify') return `UNCLEAR — say this: "${r.say}" then grade the next answer at scaffold level 0.`;
        const parts = [r.correct ? 'CORRECT' : 'NOT YET'];
        if (r.misconceptions?.length) parts.push(`misconception seen: ${r.misconceptions.join(', ')}`);
        parts.push(`next: ${r.next_move}`);
        if (r.mastered) parts.push('this one is now solid — say so, briefly');
        return parts.join(' · ');
      } catch (e) {
        return `could not record that (${e.message}) — carry on teaching`;
      }
    },

    next_phase: () => {
      setPhase(phaseIndex + 1);
      questionAskedAt = Date.now();
      const p = phaseList[phaseIndex];
      return p ? `now in ${p.phase}: ${p.label}` : 'that was the last phase — close the lesson';
    },

    show_term: (p) => { showTerm(p.word, p.definition); return `showing "${p.word}"`; },

    show_reading: () => {
      const idx = phaseList.findIndex((x) => x.phase === 'read');
      if (idx >= 0) setPhase(idx);
      return 'the reading is on screen — go quiet and let them read';
    },

    show_diagram: (p) => {
      const body = app.querySelector('#phasebody');
      if (body) body.insertAdjacentHTML('beforeend',
        `<p class="notice">Diagram: ${esc(p.diagram_id || p.id || '')}</p>`);
      return 'shown';
    },

    // The best signal in the whole system: a question the child asked unprompted.
    log_wonder: async (p) => {
      await api('/api/wonder', {
        method: 'POST', body: JSON.stringify({ question: p.question, session_id: session.id }),
      }).catch(() => {});
      return 'logged';
    },

    get_progress: () => JSON.stringify({
      phase: phaseList[phaseIndex]?.phase, index: phaseIndex, total: phaseList.length,
    }),
  };

  live = await Conversation.startSession({
    conversationToken: token,
    userId: `child_${store.child.id}`,
    clientTools,
    overrides: voice.overrides,
    dynamicVariables: voice.dynamicVariables,
    onModeChange: ({ mode }) => setTeacherState(mode === 'speaking' ? 'speaking' : 'listening'),
    onStatusChange: ({ status }) => {
      if (status === 'connected') setTeacherState('listening');
      if (status === 'disconnected') setTeacherState('ended');
    },
    onMessage: () => { questionAskedAt = Date.now(); },
    onError: (e) => console.error('conversation error', e),
  });

  startHeartbeat(session.id);
}

let heartbeat = null;
function startHeartbeat(sessionId) {
  stopHeartbeat();
  let last = Date.now();
  heartbeat = setInterval(() => {
    const delta = Date.now() - last;
    last = Date.now();
    if (document.hidden) return;      // time on task, not time with the tab open
    api('/api/session/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId, active_ms_delta: delta,
        phase: phaseList[phaseIndex]?.phase,
      }),
    }).catch(() => {});
  }, 30000);
}
function stopHeartbeat() { if (heartbeat) clearInterval(heartbeat); heartbeat = null; }

async function endLesson(completed) {
  stopHeartbeat();
  const sessionId = live?.sessionId;
  try { await live?.endSession(); } catch { /* already gone */ }
  live = null;
  await api('/api/session/end', {
    method: 'POST', body: JSON.stringify({ session_id: sessionId, completed }),
  }).catch(() => {});
  render();
}

// ───────────────────────── Mission Control ─────────────────────────

async function viewParentDashboard() {
  app.replaceChildren(el(`<p style="margin-top:3rem">Loading Mission Control…</p>`));
  const { children } = await api('/api/parent/overview');

  app.replaceChildren(el(`
    <div>
      <p class="breadcrumb">Mission Control</p>
      <h1>How they're doing</h1>
      <p class="prose">The number that matters is <strong>delayed accuracy</strong> — how much
      they get right on things they last saw at least a fortnight ago. Anything in the
      85–92% band is the system working as designed, not a B grade. Immediate scores
      after a lesson tell you almost nothing, so they aren't here.</p>

      ${children.map(renderChildPanel).join('')}
    </div>`));
}

function renderChildPanel(c) {
  const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`;
  return `
    <section style="margin-top:2.5rem">
      <h2>${esc(c.child.name)} <span class="tag">Year ${esc(c.child.year_group)}</span></h2>

      <div class="card-grid">
        <div class="card"><div class="card__accent"></div><div class="card__body">
          <p class="card__meta">Known and still known</p>
          <p style="font-size:2rem;font-weight:700;margin:0">${c.knownAndStillKnown}</p>
          <p class="card__meta">things they'd still get right in three weeks</p>
        </div></div>

        <div class="card"><div class="card__accent" style="background:var(--ok)"></div><div class="card__body">
          <p class="card__meta">Delayed accuracy</p>
          <p style="font-size:2rem;font-weight:700;margin:0">${pct(c.delayedAccuracy)}</p>
          <p class="card__meta">on ${c.delayedSample} items last seen 14+ days ago · target 85–92%</p>
        </div></div>

        <div class="card"><div class="card__accent" style="background:var(--metal)"></div><div class="card__body">
          <p class="card__meta">Answering unaided</p>
          <p style="font-size:2rem;font-weight:700;margin:0">${pct(c.unaidedFirstAttemptRate)}</p>
          <p class="card__meta">first attempt, no help from the teacher</p>
        </div></div>
      </div>

      ${c.atRisk?.length ? `
      <div class="panel panel--tip">
        <p class="panel__title">Worth asking at dinner</p>
        <ul>${c.atRisk.map((r) => `<li>${esc(r.question)}
          <span class="card__meta">(${esc(r.subject)})</span></li>`).join('')}</ul>
      </div>` : ''}

      ${c.wonderMoments?.length ? `
      <div class="panel">
        <p class="panel__title">Things ${esc(c.child.name)} asked, unprompted</p>
        <ul>${c.wonderMoments.map((w) => `<li>${esc(w.question)}</li>`).join('')}</ul>
      </div>` : ''}
    </section>`;
}

// Wake the API and its database connection before a child taps anything.
// Managed Functions cold-start, and a stall on the first tap is the difference
// between "my teacher is here" and "this is broken".
fetch('/api/ping').catch(() => {});

render().catch((e) => {
  app.replaceChildren(el(`<p class="error" style="margin-top:3rem">${esc(e.message)}</p>`));
});
