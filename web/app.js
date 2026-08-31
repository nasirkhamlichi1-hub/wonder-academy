// The Wonder Academy — client.
//
// Deliberately not React: the ElevenLabs React wrapper has an open iOS Safari bug
// where client tools never fire, and client tools are the entire mechanism by
// which the lesson advances and answers get marked. The vanilla client is the
// documented way round it.

import { Conversation } from '@elevenlabs/client';
import { drawVisual, revealNextStep, VISUAL_KINDS } from './visuals.js';
import { icon, UI } from './icons.js';

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

// One family per subject, so a subject's colour and its mark always travel
// together. Anything unrecognised falls back to the brand rather than to grey —
// a grey tile in a row of coloured ones looks broken, not neutral.
const FAMILY = {
  maths: 'maths', mathematics: 'maths',
  english: 'english', 'english-language': 'english', 'eng-lang': 'english',
  'english-literature': 'literature', 'eng-lit': 'literature', literature: 'literature',
  reading: 'english', writing: 'english',
  phonics: 'english', science: 'science', biology: 'science', chemistry: 'science',
  physics: 'science', geography: 'geography', history: 'history',
  computing: 'computing', ict: 'computing', business: 'business',
  dt: 'dt', 'design-technology': 'dt', discover: 'discover',
};
const family = (s) => FAMILY[String(s || '').toLowerCase()] || 'discover';
const subjectColour = (s) => `var(--subj-${family(s)})`;
const subjectIcon = (s) => icon(family(s));

const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase();

/** "Morning", "Afternoon", "Evening" — and the sky to match. */
function timeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return { word: 'Morning', sky: 'linear-gradient(160deg,#ffe1b3 0%,#ffb4a2 46%,#f9a8d4 100%)' };
  if (h < 17) return { word: 'Afternoon', sky: 'linear-gradient(160deg,#bfdbfe 0%,#a5d8f3 48%,#bbf7d0 100%)' };
  return { word: 'Evening', sky: 'linear-gradient(160deg,#c7d2fe 0%,#a5b4fc 46%,#fbcfe8 100%)' };
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB',
  { weekday: 'long', day: 'numeric', month: 'long' });

// ───────────────────────────── routing ─────────────────────────────

async function render() {
  const child = store.child;
  document.body.dataset.tier = child?.key_stage || '';
  whoami.classList.toggle('hidden', !child);
  signout.classList.toggle('hidden', !store.token);
  if (child) {
    whoami.style.setProperty('--accent', child.colour || 'var(--brand)');
    whoami.innerHTML = `<span class="whochip__dot">${esc(initial(child.name))}</span>${esc(child.name)}`;
  }

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
    <div class="gate"><div class="gate__in">
      <h1>Who's learning?</h1>
      <div class="who">
        ${children.map((c, i) => `
          <button class="who__btn" data-child="${esc(c.id)}" style="animation-delay:${i * 60}ms">
            <span class="who__av" style="--c:${esc(c.colour || 'var(--brand)')}">${esc(initial(c.name))}</span>
            ${esc(c.name)}
            <span class="who__sub">Year ${esc(c.year_group ?? '')}</span>
          </button>`).join('')}
        <button class="who__btn who__btn--parent" data-child="__parent">
          <span class="who__av">${UI.lock()}</span>
          Mission Control
          <span class="who__sub">For a grown-up</span>
        </button>
      </div>
    </div></div>`));

  app.querySelectorAll('[data-child]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = children.find((x) => x.id === b.dataset.child);
      viewPin(b.dataset.child, c?.name || 'Mission Control', c?.colour);
    }));
}

function viewPin(childId, name, colour) {
  const isParent = childId === '__parent';
  let pin = '';
  const view = el(`
    <div class="gate"><div class="gate__in">
      <div class="pinpad">
        <div class="pinpad__who" style="--c:${esc(colour || 'var(--ink)')}">${
          isParent ? UI.lock() : esc(initial(name))}</div>
        <h1>${esc(name)}</h1>
        <div class="pinpad__display">${'<div class="pinpad__dot"></div>'.repeat(4)}</div>
        <p class="error hidden" id="pinerr"></p>
        <div class="pinpad__keys">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="btn" data-k="${n}">${n}</button>`).join('')}
          <button class="btn" data-k="back" aria-label="Delete">${UI.back()}</button>
          <button class="btn" data-k="0">0</button>
          <button class="btn" data-k="cancel" aria-label="Back to who's learning">×</button>
        </div>
      </div>
    </div></div>`);
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
  const t = timeOfDay();

  // Paint the page before the subject data lands. A spinner on the home screen
  // is a worse first impression than a hero with an empty shelf under it.
  app.replaceChildren(el(`
    <div>
      <section class="hero" style="--sky:${t.sky}">
        <div class="hero__grain"></div>
        <div class="shell">
          <p class="hero__date">${esc(LONG_DATE.format(new Date()))}</p>
          <h1>${t.word}, ${esc(child.name)}.</h1>
          <p class="hero__sub">${untimed
            ? `A few short goes today, and we stop while you still want more.`
            : `Two sittings, ${child.session_minutes} minutes each. Your teacher talks — you talk back.`}</p>
        </div>
      </section>

      <div class="shell">
        <div class="sittings${untimed ? ' sittings--one' : ''}" id="sittings">
          ${untimed
            ? sittingCard(1, 'Ready when you are', 'A few short goes, then we stop.', false)
            : sittingCard(1, 'First sitting', 'Your teacher picks up where you left off.', false)}
          ${untimed ? '' : sittingCard(2, 'Second sitting', 'A different subject, later on.', true)}
        </div>

        <section class="section" id="subjects" hidden>
          <div class="section__head">
            <h2>Your subjects</h2>
            <p class="section__note" id="subjnote"></p>
          </div>
          <div class="tiles" id="tiles"></div>
        </section>

        <section class="section" id="wonders" hidden>
          <div class="panel">
            <p class="panel__title">Things you wondered</p>
            <ul id="wonderlist"></ul>
          </div>
        </section>

        <p class="notice">Your teacher is a computer, not a person, and it listens through
        your microphone. Headphones make it work much better.</p>
      </div>
    </div>`));

  app.querySelector('#start1')?.addEventListener('click', (e) => beginLesson(1, e));
  app.querySelector('#start2')?.addEventListener('click', (e) => beginLesson(2, e));

  // The shelf. If it fails, the page above it still works.
  try {
    const today = await api('/api/child/today');
    paintSubjects(today);
    paintSittings(today);
  } catch { /* the sittings are the part that matters */ }
}

function sittingCard(n, title, meta, rest) {
  return `
    <div class="sit${rest ? ' sit--rest' : ''}" data-block="${n}">
      <span class="sit__n">${n}</span>
      <h2 class="sit__t">${esc(title)}</h2>
      <p class="sit__m">${esc(meta)}</p>
      <button class="btn ${rest ? '' : 'btn--primary'} btn--big btn--block" id="start${n}">
        ${UI.play()} Start
      </button>
    </div>`;
}

/** The Bitesize move: every subject a full block of its own colour. */
function paintSubjects({ subjects = [] }) {
  const shelf = app.querySelector('#subjects');
  const tiles = app.querySelector('#tiles');
  if (!shelf || !tiles || !subjects.length) return;

  const held = subjects.reduce((a, s) => a + s.held, 0);
  const total = subjects.reduce((a, s) => a + s.total, 0);
  const note = app.querySelector('#subjnote');
  if (note && total) note.textContent = `${held} of ${total} ideas held so far`;

  tiles.innerHTML = subjects.map((s, i) => `
    <div class="tile" style="--c:${subjectColour(s.id)};--p:${Math.round(s.progress * 100)}%;
                             animation-delay:${i * 55}ms">
      <span class="tile__ghost">${subjectIcon(s.id)}</span>
      <span class="tile__top">
        <span class="tile__mark">${subjectIcon(s.id)}</span>
        ${s.board ? `<span class="tile__board">${esc(s.board)}</span>` : ''}
      </span>
      <div>
        <h3 class="tile__name">${esc(s.short || s.name)}</h3>
      </div>
      <div>
        <span class="tile__bar"><i></i></span>
        <span class="tile__foot">
          ${s.total ? `${Math.round(s.progress * 100)}% held` : 'Not started'}
          ${s.due ? `<span class="tile__due">${s.due} due</span>` : ''}
        </span>
      </div>
    </div>`).join('');
  shelf.hidden = false;
}

function paintSittings({ blocks = [], wonders = [] }) {
  for (const b of blocks) {
    const card = app.querySelector(`.sit[data-block="${b.block}"]`);
    if (!card || !b.completed) continue;
    card.querySelector(`#start${b.block}`)?.replaceWith(
      el(`<p class="sit__done">${UI.check()} Done today</p>`));
  }
  if (wonders.length) {
    const list = app.querySelector('#wonderlist');
    if (list) {
      list.innerHTML = wonders.map((w) => `<li>${esc(w)}</li>`).join('');
      app.querySelector('#wonders').hidden = false;
    }
  }
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
    <div class="lesson" style="--accent:${colour}">
      <header class="lesson__head">
        <div class="shell">
          <p class="lesson__crumb">
            ${esc(child.name)} › ${esc(lesson.subjectName)}${lesson.unit ? ` › ${esc(lesson.unit)}` : ''}
          </p>
          <h1>${esc(lesson.title)}</h1>
          <p class="lesson__tags">
            ${lesson.specRef ? `<span class="tag tag--board">${esc(lesson.specRef)}</span>` : ''}
            ${lesson.bigRock ? `<span class="tag tag--key">Key lesson</span>` : ''}
            ${lesson.termName ? `<span class="tag">${esc(lesson.termName)} · week ${esc(lesson.week)}</span>` : ''}
          </p>
          <div class="phases" id="phases">
            ${teachable.map((p, i) =>
              `<button class="phase-pip" data-i="${i}" title="${esc(p.label)}">
                 <span class="sr">${esc(p.label)}</span></button>`).join('')}
          </div>
        </div>
      </header>

      <div class="shell">
        <div class="stage">
          <!-- The board. The teacher draws here; it is never left empty. -->
          <div class="board" id="board" aria-live="polite"></div>

          <aside class="teacher">
            <div class="orb" id="orb"></div>
            <p class="teacher__name">Your teacher</p>
            <p class="teacher__state" id="tstate">Connecting…</p>
            <p class="phase-now" id="phasenow"></p>
            <div id="asidebody"></div>
            <button class="btn btn--ghost" id="endlesson">Finish for now</button>
          </aside>
        </div>
      </div>
    </div>`));

  app.querySelector('#endlesson').addEventListener('click', () => endLesson(false));
  app.querySelectorAll('.phase-pip').forEach((pip) =>
    pip.addEventListener('click', () => setPhase(Number(pip.dataset.i))));

  // Opening state: what today is about. A blank screen at "hello" is the thing
  // that made this feel dull.
  board(session);
  drawVisual(app.querySelector('#board'), {
    kind: 'title',
    eyebrow: `${lesson.subjectName}${lesson.unit ? ` · ${lesson.unit}` : ''}`,
    title: 'By the end of this you can…',
    points: (lesson.objectives || []).map((o) => o.replace(/^I can /i, '')),
  });
  setPhase(0, teachable);
}

let phaseIndex = 0;
let phaseList = [];
let currentSession = null;
const board = (s) => { if (s) currentSession = s; return app.querySelector('#board'); };

function setPhase(i, list) {
  phaseList = list || phaseList;
  phaseIndex = Math.max(0, Math.min(i, phaseList.length - 1));
  app.querySelectorAll('.phase-pip').forEach((p, n) => {
    p.classList.toggle('phase-pip--done', n < phaseIndex);
    p.classList.toggle('phase-pip--now', n === phaseIndex);
  });

  const phase = phaseList[phaseIndex];
  const now = app.querySelector('#phasenow');
  const aside = app.querySelector('#asidebody');
  if (!phase) return;
  if (now) now.textContent = phase.label;

  // The aside carries the quiet supporting material. The board carries whatever
  // the teacher is talking about right now.
  if (aside) {
    const lesson = currentSession?.lesson || {};
    aside.innerHTML =
      phase.phase === 'read' && lesson.vocabulary?.length
        ? `<div class="aside-block"><p class="aside-block__t">Words</p>
             <ul>${lesson.vocabulary.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div>`
        : phase.phase === 'teachback'
          ? `<div class="aside-block"><p class="aside-block__t">Over to you</p>
               <p>${esc(phase.prompt || 'Explain it back.')}</p>
               ${phase.sentenceStarter
                 ? `<p class="aside-block__hint">Start: "${esc(phase.sentenceStarter)}…"</p>` : ''}
             </div>`
          : `<p class="aside-hint">${esc(phaseHint(phase))}</p>`;
  }

  // Moving to reading or explaining has a natural default picture; the teacher
  // overrides it the moment it wants to show something specific.
  const lesson = currentSession?.lesson;
  if (!lesson) return;
  if (phase.phase === 'read') {
    drawVisual(board(), {
      kind: 'title', eyebrow: 'The idea',
      title: lesson.unit || lesson.subjectName,
      points: (lesson.objectives || []).map((o) => o.replace(/^I can /i, '')),
    });
  } else if (phase.phase === 'teachback') {
    drawVisual(board(), {
      kind: 'title', eyebrow: 'Your turn',
      title: 'Explain it back',
      points: (lesson.objectives || []).map((o) => o.replace(/^I can /i, '')),
    });
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

    // The board. This is what stops the lesson being a voice in an empty room.
    show_visual: (p) => {
      try { return drawVisual(board(), p.spec ? JSON.parse(p.spec) : p); }
      catch (e) { return `could not draw that (${e.message}) — check the spec is valid JSON`; }
    },

    reveal_step: () => revealNextStep(board()),

    show_term: (p) => drawVisual(board(), {
      kind: 'term', word: p.word, definition: p.definition, phonetic: p.phonetic,
    }),

    show_reading: () => {
      const idx = phaseList.findIndex((x) => x.phase === 'read');
      if (idx >= 0) setPhase(idx);
      return 'the reading is on screen — go quiet and let them read';
    },

    // Kept because the agent already knows this name; it just draws now.
    show_diagram: (p) => {
      try { return drawVisual(board(), p.spec ? JSON.parse(p.spec) : p); }
      catch { return 'use show_visual with a spec object'; }
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
  app.replaceChildren(el(`<div class="gate"><div class="gate__in">
    <p class="prose">Loading Mission Control…</p></div></div>`));
  const { children } = await api('/api/parent/overview');

  app.replaceChildren(el(`
    <div>
      <section class="hero" style="--sky:linear-gradient(160deg,#e2e8f0 0%,#cbd5e1 50%,#e0e7ff 100%)">
        <div class="hero__grain"></div>
        <div class="shell">
          <p class="hero__date">Mission Control</p>
          <h1>How they're doing</h1>
          <p class="hero__sub">The number that matters is <strong>delayed accuracy</strong> — how
          much they get right on things they last saw a fortnight ago or more. The 85–92%
          band is the system working as designed, not a B grade.</p>
        </div>
      </section>
      <div class="shell" style="padding-top:var(--space-5)">
        ${children.map(renderChildPanel).join('')}
      </div>
      <div class="shell"><p class="notice">Immediate post-lesson scores tell you almost nothing
      about what will still be there next month, so they are not shown anywhere.</p></div>
    </div>`));
}

/* 88% is the system working, not a near-miss. A number on its own invites the
   school reading, so the band is drawn and the number sits inside it. */
const band = (v) => v == null ? 'var(--muted-2)'
  : v < 0.85 ? 'var(--warn)' : v > 0.92 ? 'var(--warn)' : 'var(--ok)';

function bandBar(v) {
  if (v == null) return '';
  const x = Math.max(0, Math.min(1, (v - 0.70) / 0.30));   // scale 70–100%
  return `<div class="band" role="img"
      aria-label="${Math.round(v * 100)} per cent, against a target band of 85 to 92 per cent">
      <span class="band__target"></span>
      <span class="band__now" style="left:${(x * 100).toFixed(1)}%"></span>
    </div>
    <p class="band__key">70% <em>target 85–92</em> 100%</p>`;
}

function renderChildPanel(c) {
  const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`;
  const colour = c.child.colour || 'var(--brand)';
  return `
    <section class="section" style="--accent:${esc(colour)}">
      <div class="section__head">
        <h2>${esc(c.child.name)}</h2>
        <span class="tag">Year ${esc(c.child.year_group)}</span>
      </div>

      <div class="card-grid">
        <div class="stat">
          <p class="stat__k">Known and still known</p>
          <p class="stat__v">${c.knownAndStillKnown}</p>
          <p class="stat__m">things they'd still get right in three weeks</p>
        </div>
        <div class="stat" style="--accent:${band(c.delayedAccuracy)}">
          <p class="stat__k">Delayed accuracy</p>
          <p class="stat__v">${pct(c.delayedAccuracy)}</p>
          ${bandBar(c.delayedAccuracy)}
          <p class="stat__m">on ${c.delayedSample} items last seen 14+ days ago</p>
        </div>
        <div class="stat" style="--accent:var(--muted-2)">
          <p class="stat__k">Answering unaided</p>
          <p class="stat__v">${pct(c.unaidedFirstAttemptRate)}</p>
          <p class="stat__m">first attempt, no help from the teacher</p>
        </div>
      </div>

      ${c.atRisk?.length ? `
      <div class="panel">
        <p class="panel__title">Worth asking at dinner</p>
        <ul>${c.atRisk.map((r) => `<li>${esc(r.question)}
          <span class="stat__m" style="display:inline">(${esc(r.subject)})</span></li>`).join('')}</ul>
      </div>` : ''}

      ${c.wonderMoments?.length ? `
      <div class="panel" style="--accent:var(--gold)">
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
  app.replaceChildren(el(`<div class="gate"><div class="gate__in"><p class="error">${esc(e.message)}</p></div></div>`));
});
