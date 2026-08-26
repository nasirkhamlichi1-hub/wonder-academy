/* Wonder Academy — application shell */

const AVATARS = ['🦊', '🐼', '🦉', '🐝', '🦁', '🐙', '🦖', '🐧', '🦄', '🐬', '🦔', '🐢'];
const COLOURS = ['#3d5afe', '#e0396a', '#0f9d58', '#f4a015', '#8e44ad', '#00A5B5'];
const DAILY_TARGET = 3;

const app = document.getElementById('app');
const State = { childId: null, screen: 'boot' };

/* ------------------------------------------------------------- helpers -- */
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'style') n.setAttribute('style', v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return n;
};
const clear = () => { app.innerHTML = ''; };
const yearName = y => (YEARS.find(v => v.y === y) || {}).name || ('Year ' + y);
const yearStage = y => (YEARS.find(v => v.y === y) || {}).stage || '';
const skillsFor = (subject, year) => (SKILLS[subject] && SKILLS[subject][year]) || [];
const subjectName = id => (SUBJECTS.find(s => s.id === id) || {}).name || id;

function normalise(s) {
  return String(s).trim().toLowerCase()
    .replace(/[£$,\s]/g, '')
    .replace(/×/g, 'x')
    .replace(/−/g, '-')
    .replace(/\.0+$/, '');
}
function isNumeric(s) { return /^-?\d+(\.\d+)?$/.test(String(s).replace(/[£,\s]/g, '')); }
function checkAnswer(given, expected) {
  const g = normalise(given), e = normalise(expected);
  if (g === e) return true;
  if (isNumeric(g) && isNumeric(e)) return Math.abs(Number(g) - Number(e)) < 1e-6;
  // tolerate "x=3,y=1" written as "x = 3, y = 1" (spaces already stripped)
  return false;
}

/* --------------------------------------------------------- question set -- */
function buildQuestions(subject, year, skill, n = 10) {
  const out = [];
  if (subject === 'maths') {
    const seen = new Set();
    let guard = 0;
    while (out.length < n && guard < n * 25) {
      guard++;
      const gen = GEN[skill.gen];
      if (!gen) break;
      let q;
      try { q = gen(year); } catch (err) { console.warn('generator error', skill.gen, err); break; }
      if (!q || seen.has(q.q)) continue;
      seen.add(q.q);
      if (q.kind === 'choice') q.options = R.shuffle(q.options);
      out.push(q);
    }
    if (!out.length) out.push({ q: 'Question unavailable — please pick another topic.', kind: 'input', answer: '', why: '' });
    return out;
  }
  const items = R.shuffle(skill.items || []).slice(0, n);
  return items.map(it => ({
    q: it.q,
    kind: 'choice',
    answer: it.o[it.a],
    options: R.shuffle(it.o.slice()),
    why: it.w
  }));
}

/* ------------------------------------------------------------- chrome --- */
const btnSwitch = document.getElementById('btn-switch');
const btnParent = document.getElementById('btn-parent');
btnSwitch.addEventListener('click', () => { State.childId = null; renderProfiles(); });
btnParent.addEventListener('click', () => renderParent());

function setChrome(inChild) { btnSwitch.classList.toggle('hidden', !inChild); }

/* ---------------------------------------------------------- first run --- */
function renderSetup(prefill) {
  setChrome(false); clear();
  const kids = Store.children();
  const form = el('div', { class: 'card', style: 'max-width:520px' });
  const nameI = el('input', { type: 'text', id: 'f-name', placeholder: 'e.g. Amina', maxlength: '24', value: prefill?.name || '' });
  const yearS = el('select', { id: 'f-year' },
    ...YEARS.map(y => el('option', { value: y.y, selected: prefill && prefill.year === y.y }, `${y.name} (${y.stage}, ages ${y.ages})`)));
  const pinI = el('input', { type: 'text', id: 'f-pin', inputmode: 'numeric', maxlength: '4', placeholder: '4 digits, e.g. 1234', value: prefill?.pin || '' });

  let avatar = prefill?.avatar || AVATARS[kids.length % AVATARS.length];
  let colour = prefill?.colour || COLOURS[kids.length % COLOURS.length];

  const avRow = el('div', { class: 'row' });
  AVATARS.forEach(a => {
    const b = el('button', {
      class: 'quiet small', type: 'button', 'data-a': a,
      onclick: () => { avatar = a; paint(); }
    }, a);
    avRow.appendChild(b);
  });
  const coRow = el('div', { class: 'row' });
  COLOURS.forEach(c => {
    const b = el('button', {
      class: 'small', type: 'button', style: `background:${c};width:34px;height:34px;padding:0;border-radius:50%`,
      'aria-label': 'colour ' + c, 'data-c': c, onclick: () => { colour = c; paint(); }
    }, '');
    coRow.appendChild(b);
  });
  function paint() {
    avRow.querySelectorAll('button').forEach(b => b.style.outline = b.dataset.a === avatar ? '3px solid var(--accent)' : 'none');
    coRow.querySelectorAll('button').forEach(b => b.style.outline = b.dataset.c === colour ? '3px solid var(--ink)' : 'none');
  }

  const err = el('p', { class: 'faint', style: 'color:var(--bad)' });

  form.append(
    el('h3', {}, kids.length ? 'Add another learner' : 'Add your first learner'),
    el('p', { class: 'faint' }, 'The year group sets the whole curriculum ladder — last year’s recap, this year’s core work and next year’s stretch. You can change it any time in the parent area.'),
    el('div', { class: 'field' }, el('label', { for: 'f-name' }, 'First name'), nameI),
    el('div', { class: 'field' }, el('label', { for: 'f-year' }, 'Year group (England)'), yearS),
    el('div', { class: 'field' }, el('label', {}, 'Avatar'), avRow),
    el('div', { class: 'field' }, el('label', {}, 'Colour'), coRow),
    el('div', { class: 'field' }, el('label', { for: 'f-pin' }, 'Login PIN (4 digits)'), pinI,
      el('p', { class: 'faint' }, 'This just keeps siblings out of each other’s progress. It is not real security.')),
    err,
    el('div', { class: 'row' },
      el('button', {
        onclick: () => {
          const name = nameI.value.trim();
          const pin = pinI.value.trim();
          if (!name) { err.textContent = 'Please enter a name.'; return; }
          if (!/^\d{4}$/.test(pin)) { err.textContent = 'The PIN must be exactly 4 digits.'; return; }
          Store.addChild({ name, year: Number(yearS.value), avatar, colour, pin });
          renderProfiles();
        }
      }, 'Save learner'),
      kids.length ? el('button', { class: 'ghost', onclick: () => renderProfiles() }, 'Cancel') : null
    )
  );

  app.append(
    el('h1', {}, kids.length ? 'Add a learner' : 'Welcome to Wonder Academy'),
    el('p', { class: 'lede' }, kids.length
      ? 'Each learner gets their own ladder, progress and PIN.'
      : 'Set up one profile per child. Everything is stored in this browser — no accounts, no servers, nothing leaves this device.'),
    form
  );
  paint();
  nameI.focus();
}

/* --------------------------------------------------------- profile pick -- */
function renderProfiles() {
  setChrome(false); clear();
  const kids = Store.children();
  if (!kids.length) return renderSetup();

  const grid = el('div', { class: 'grid cols-3' });
  kids.forEach(c => {
    const lvl = Store.levelFor(c.xp);
    grid.appendChild(el('button', {
      class: 'child-card', style: `--c:${c.colour}`, onclick: () => renderPin(c.id)
    },
      el('span', { class: 'avatar', style: `background:${c.colour}22` }, c.avatar),
      el('span', { class: 'who' },
        el('strong', {}, c.name),
        el('span', { class: 'faint' }, `${yearName(c.year)} · Level ${lvl.n} ${lvl.title}`),
        el('span', { class: 'bar', style: `--c:${c.colour};margin-top:8px` }, el('i', { style: `width:${Math.round(lvl.progress * 100)}%` }))
      )
    ));
  });

  app.append(
    el('h1', {}, 'Who’s learning today?'),
    el('p', { class: 'lede' }, 'Pick your name, then enter your PIN.'),
    grid,
    el('div', { class: 'row', style: 'margin-top:22px' },
      el('button', { class: 'ghost', onclick: () => renderSetup() }, '+ Add a learner'))
  );
}

/* ------------------------------------------------------------- PIN pad -- */
function renderPin(childId) {
  const c = Store.child(childId);
  if (!c) return renderProfiles();
  setChrome(false); clear();
  let entered = '';
  const dots = el('div', { class: 'row', style: 'gap:12px;margin:6px 0 18px' });
  const err = el('p', { class: 'faint', style: 'color:var(--bad);min-height:1.4em' });

  function paint() {
    dots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      dots.appendChild(el('span', {
        style: `width:18px;height:18px;border-radius:50%;border:2px solid var(--line);background:${i < entered.length ? c.colour : 'transparent'}`
      }));
    }
  }
  function push(d) {
    if (entered.length >= 4) return;
    entered += d; paint();
    if (entered.length === 4) {
      if (entered === c.pin) { State.childId = c.id; renderHome(); }
      else { err.textContent = 'That PIN is not right — try again.'; entered = ''; setTimeout(paint, 120); }
    }
  }

  const pad = el('div', { class: 'grid', style: 'grid-template-columns:repeat(3,72px);gap:10px' });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(d =>
    pad.appendChild(el('button', { class: 'quiet', style: 'height:60px;font-size:1.3rem', onclick: () => push(d) }, d)));
  pad.appendChild(el('button', { class: 'ghost', style: 'height:60px', onclick: () => { entered = ''; err.textContent = ''; paint(); } }, 'Clear'));
  pad.appendChild(el('button', { class: 'quiet', style: 'height:60px;font-size:1.3rem', onclick: () => push('0') }, '0'));
  pad.appendChild(el('button', { class: 'ghost', style: 'height:60px', onclick: () => renderProfiles() }, 'Back'));

  document.onkeydown = e => {
    if (State.screen !== 'pin') return;
    if (/^\d$/.test(e.key)) push(e.key);
    if (e.key === 'Backspace') { entered = entered.slice(0, -1); paint(); }
    if (e.key === 'Escape') renderProfiles();
  };
  State.screen = 'pin';

  app.append(
    el('div', { class: 'card', style: 'max-width:380px;text-align:center' },
      el('div', { class: 'avatar', style: `margin:0 auto 10px;background:${c.colour}22` }, c.avatar),
      el('h3', {}, `Hello, ${c.name}`),
      el('p', { class: 'faint' }, 'Enter your 4-digit PIN'),
      el('div', { style: 'display:flex;justify-content:center' }, dots),
      err,
      el('div', { style: 'display:flex;justify-content:center' }, pad)
    )
  );
  paint();
}

/* ---------------------------------------------------------------- home -- */
function renderHome() {
  const c = Store.child(State.childId);
  if (!c) return renderProfiles();
  State.screen = 'home';
  document.onkeydown = null;
  setChrome(true); clear();

  const lvl = Store.levelFor(c.xp);
  const today = Store.today();
  const doneToday = c.history.filter(h => h.day === today).length;

  const header = el('div', { class: 'card', style: `--c:${c.colour};border-left:6px solid ${c.colour}` },
    el('div', { class: 'row', style: 'gap:16px;align-items:flex-start' },
      el('span', { class: 'avatar', style: `background:${c.colour}22` }, c.avatar),
      el('div', { style: 'flex:1;min-width:200px' },
        el('h1', { style: 'margin:0' }, `Hi ${c.name}`),
        el('p', { class: 'faint', style: 'margin:2px 0 12px' },
          `${yearName(c.year)} · ${yearStage(c.year)} · Level ${lvl.n} ${lvl.title}`),
        el('div', { class: 'bar', style: `--c:${c.colour}` }, el('i', { style: `width:${Math.round(lvl.progress * 100)}%` })),
        el('p', { class: 'faint', style: 'margin:6px 0 0' },
          lvl.next ? `${lvl.next.at - c.xp} XP to Level ${lvl.next.n} ${lvl.next.title}` : 'Top level reached — outstanding.')
      )
    ),
    el('div', { class: 'stat', style: 'margin-top:18px' },
      el('div', {}, el('b', {}, c.xp), el('span', {}, 'total XP')),
      el('div', {}, el('b', {}, (c.streak || 0) + '🔥'), el('span', {}, 'day streak')),
      el('div', {}, el('b', {}, `${Math.min(doneToday, DAILY_TARGET)}/${DAILY_TARGET}`), el('span', {}, 'today’s quests')),
      el('div', {}, el('b', {}, Object.values(c.mastery).filter(m => m.level >= 2).length), el('span', {}, 'topics secure'))
    )
  );

  const subjGrid = el('div', { class: 'grid cols-3' });
  SUBJECTS.forEach(s => {
    const core = skillsFor(s.id, c.year);
    const secure = core.filter(k => (c.mastery[k.id] || {}).level >= 2).length;
    const pct = core.length ? Math.round((secure / core.length) * 100) : 0;
    subjGrid.appendChild(el('button', {
      class: 'child-card', style: `--c:${c.colour}`, onclick: () => renderSubject(s.id)
    },
      el('span', { class: 'avatar', style: `background:${c.colour}22` }, s.icon),
      el('span', { class: 'who' },
        el('strong', {}, s.name),
        el('span', { class: 'faint' }, `${secure} of ${core.length} ${yearName(c.year)} topics secure`),
        el('span', { class: 'bar', style: `--c:${c.colour};margin-top:8px` }, el('i', { style: `width:${pct}%` }))
      )
    ));
  });

  const recent = el('div', { class: 'card' });
  recent.appendChild(el('h3', {}, 'Recent work'));
  if (!c.history.length) {
    recent.appendChild(el('p', { class: 'faint' }, 'Nothing yet — pick a subject above to start.'));
  } else {
    const t = el('table', {}, el('thead', {}, el('tr', {},
      el('th', {}, 'Day'), el('th', {}, 'Subject'), el('th', {}, 'Topic'), el('th', {}, 'Score'), el('th', {}, 'XP'))));
    const tb = el('tbody');
    c.history.slice(0, 8).forEach(h => tb.appendChild(el('tr', {},
      el('td', {}, h.day), el('td', {}, subjectName(h.subject)), el('td', {}, h.skillName),
      el('td', {}, `${h.score}/${h.total}`), el('td', {}, '+' + h.xp))));
    t.appendChild(tb);
    recent.appendChild(t);
  }

  app.append(header, el('h2', {}, 'Choose a subject'), subjGrid, el('h2', {}, 'Progress'), recent);
}

/* ------------------------------------------------------------- subject -- */
function tierUnlocked(c, subject) {
  const core = skillsFor(subject, c.year);
  if (!core.length) return true;
  const secure = core.filter(k => (c.mastery[k.id] || {}).level >= 2).length;
  return secure / core.length >= 0.5;
}

function renderSubject(subject) {
  const c = Store.child(State.childId);
  if (!c) return renderProfiles();
  State.screen = 'subject';
  setChrome(true); clear();

  const tiers = [
    { key: 'recap', year: c.year - 1, title: 'Recap', blurb: `What ${c.name} covered in ${yearName(c.year - 1)} — keep it sharp.` },
    { key: 'core', year: c.year, title: 'This year', blurb: `The ${yearName(c.year)} programme of study.` },
    { key: 'stretch', year: c.year + 1, title: 'Next year', blurb: `A head start on ${yearName(c.year + 1)}.` }
  ];

  app.append(
    el('div', { class: 'row' },
      el('button', { class: 'ghost small', onclick: () => renderHome() }, '← Back'),
      el('span', { class: 'pill' }, `${yearName(c.year)}`)),
    el('h1', {}, subjectName(subject)),
    el('p', { class: 'lede' }, 'Work down the ladder: recap what came before, master this year, then stretch ahead.')
  );

  tiers.forEach(t => {
    const list = skillsFor(subject, t.year);
    if (t.year < 1 || t.year > 9 || !list.length) return;
    const locked = t.key === 'stretch' && !tierUnlocked(c, subject);

    app.append(el('div', { class: 'tier-head' },
      el('h2', {}, t.title),
      el('span', { class: 'pill' + (t.key === 'core' ? ' good' : '') }, yearName(t.year)),
      locked ? el('span', { class: 'pill warn' }, 'Locked') : null));
    app.append(el('p', { class: 'faint', style: 'margin:-4px 0 10px' },
      locked ? `Secure half of the ${yearName(c.year)} topics to unlock next year’s work.` : t.blurb));

    const grid = el('div', { class: 'grid' });
    list.forEach(s => {
      const m = c.mastery[s.id] || { level: 0, bestPct: 0, attempts: 0 };
      const dots = el('span', { class: 'dots' },
        [1, 2, 3].map(i => el('span', { class: 'dot' + (m.level >= i ? ' on' : '') })));
      grid.appendChild(el('button', {
        class: 'skill', disabled: locked || null,
        onclick: locked ? null : () => startQuiz(subject, t.year, s, t.key)
      },
        el('span', { class: 'name' },
          el('strong', {}, s.name),
          el('em', {}, s.obj)),
        m.attempts ? el('span', { class: 'pill' }, `best ${m.bestPct}%`) : null,
        dots
      ));
    });
    app.append(grid);
  });
}

/* ---------------------------------------------------------------- quiz -- */
function startQuiz(subject, year, skill, tier) {
  const c = Store.child(State.childId);
  const questions = buildQuestions(subject, year, skill, 10);
  const session = { subject, year, skill, tier, questions, i: 0, score: 0, wrong: [] };
  renderQuiz(session, c);
}

function renderQuiz(s, c) {
  State.screen = 'quiz';
  setChrome(true); clear();
  const q = s.questions[s.i];
  let answered = false;

  const progress = el('div', { class: 'bar', style: `--c:${c.colour}` },
    el('i', { style: `width:${(s.i / s.questions.length) * 100}%` }));

  const feedback = el('div', { class: 'hidden' });
  const nextBtn = el('button', { class: 'hidden', onclick: () => advance() }, s.i === s.questions.length - 1 ? 'See results' : 'Next question');

  function judge(given, sourceBtn) {
    if (answered) return;
    answered = true;
    const ok = checkAnswer(given, q.answer);
    if (ok) s.score++; else s.wrong.push({ q: q.q, given, answer: q.answer, why: q.why });
    if (sourceBtn) {
      sourceBtn.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) {
        [...optWrap.querySelectorAll('.opt')].forEach(b => {
          if (normalise(b.textContent) === normalise(q.answer)) b.classList.add('correct');
        });
      }
      [...optWrap.querySelectorAll('.opt')].forEach(b => b.disabled = true);
    }
    if (input) input.disabled = true;
    if (submit) submit.classList.add('hidden');
    feedback.className = 'feedback ' + (ok ? 'good' : 'bad');
    feedback.innerHTML = '';
    feedback.append(
      el('span', {}, ok ? '✓ Correct' : `✗ Not quite — the answer is ${q.answer}`),
      q.why ? el('span', { class: 'why' }, q.why) : null
    );
    nextBtn.classList.remove('hidden');
    // Delay the focus: focusing during the Enter keydown lets the same
    // keypress activate the button, skipping the explanation entirely.
    setTimeout(() => nextBtn.focus(), 450);
  }

  function advance() {
    s.i++;
    if (s.i >= s.questions.length) return finishQuiz(s, c);
    renderQuiz(s, c);
  }

  let optWrap = el('div', { class: 'options' });
  let input = null, submit = null;

  if (q.kind === 'choice') {
    q.options.forEach(o => optWrap.appendChild(
      el('button', { class: 'opt', onclick: e => judge(o, e.currentTarget) }, o)));
  } else {
    input = el('input', { type: 'text', id: 'ans', autocomplete: 'off', placeholder: 'Your answer' });
    submit = el('button', { onclick: () => judge(input.value) }, 'Check');
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();          // never let Enter reach the Next button
      judge(input.value);
    });
    optWrap = el('div', { class: 'answer-row' }, input, submit);
  }

  app.append(
    el('div', { class: 'quiz-top' },
      el('button', { class: 'ghost small', onclick: () => renderSubject(s.subject) }, '← Quit'),
      progress,
      el('span', { class: 'pill' }, `${s.i + 1} / ${s.questions.length}`)),
    el('p', { class: 'faint', style: 'margin:0 0 8px' }, `${subjectName(s.subject)} · ${s.skill.name} · ${yearName(s.year)}`),
    el('div', { class: 'card qcard' },
      el('p', { class: 'question' }, q.q),
      optWrap,
      feedback,
      el('div', { class: 'row', style: 'margin-top:18px' }, nextBtn)
    )
  );
  if (input) input.focus();
}

function finishQuiz(s, c) {
  const res = Store.recordResult(c.id, {
    subject: s.subject, skillId: s.skill.id, skillName: s.skill.name,
    score: s.score, total: s.questions.length, tier: s.tier
  });
  State.screen = 'results';
  setChrome(true); clear();

  const pct = res.pct;
  const msg = pct === 100 ? 'Perfect round.' : pct >= 80 ? 'Strong work.' : pct >= 50 ? 'Good effort — worth another go.' : 'Tricky one. Try it again after a break.';

  const card = el('div', { class: 'card', style: 'text-align:center' },
    el('p', { class: 'score-ring', style: `color:${c.colour}` }, `${s.score}/${s.questions.length}`),
    el('h3', {}, msg),
    el('p', { class: 'faint' }, `${s.skill.name} · ${yearName(s.year)}`),
    el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
      el('span', { class: 'pill good' }, `+${res.xpGained} XP`),
      res.levelUp ? el('span', { class: 'pill good' }, `Level up — ${res.newLevel.title}!`) : null,
      el('span', { class: 'pill' }, `Mastery ${['—', 'started', 'secure', 'mastered'][res.mastery.level]}`))
  );

  const review = el('div', { class: 'card' });
  if (s.wrong.length) {
    review.append(el('h3', {}, 'Worth another look'));
    s.wrong.forEach(w => review.append(
      el('p', { style: 'margin:12px 0 0' }, el('strong', {}, w.q)),
      el('p', { class: 'faint', style: 'margin:2px 0' },
        `You put “${w.given || '—'}”. The answer is ${w.answer}. ${w.why || ''}`)
    ));
  } else {
    review.append(el('h3', {}, 'Nothing to review'), el('p', { class: 'faint' }, 'Every question correct — pick the next topic or stretch into next year.'));
  }

  app.append(
    el('h1', {}, 'Round complete'),
    card,
    review,
    el('div', { class: 'row', style: 'margin-top:18px' },
      el('button', { onclick: () => startQuiz(s.subject, s.year, s.skill, s.tier) }, 'Try again'),
      el('button', { class: 'ghost', onclick: () => renderSubject(s.subject) }, 'Back to topics'),
      el('button', { class: 'ghost', onclick: () => renderHome() }, 'Home'))
  );
}

/* --------------------------------------------------------- parent area -- */
function renderParent() {
  State.screen = 'parent';
  document.onkeydown = null;
  setChrome(false); clear();
  const kids = Store.children();

  app.append(
    el('div', { class: 'row' }, el('button', {
      class: 'ghost small', onclick: () => (State.childId ? renderHome() : renderProfiles())
    }, '← Back')),
    el('h1', {}, 'Parent area'),
    el('p', { class: 'lede' }, 'Manage learners, check progress, and back up or restore the data. Everything is stored in this browser only.')
  );

  if (!kids.length) {
    app.append(el('div', { class: 'card' }, el('p', { class: 'faint' }, 'No learners yet.'),
      el('button', { onclick: () => renderSetup() }, 'Add a learner')));
  }

  kids.forEach(c => {
    const lvl = Store.levelFor(c.xp);
    const attempted = Object.keys(c.mastery).length;
    const secure = Object.values(c.mastery).filter(m => m.level >= 2).length;
    const mastered = Object.values(c.mastery).filter(m => m.level >= 3).length;

    const yearSel = el('select', {},
      ...YEARS.map(y => el('option', { value: y.y, selected: y.y === c.year }, y.name)));
    yearSel.addEventListener('change', () => { Store.updateChild(c.id, { year: Number(yearSel.value) }); renderParent(); });

    const pinIn = el('input', { type: 'text', maxlength: '4', inputmode: 'numeric', value: c.pin, style: 'max-width:120px' });
    pinIn.addEventListener('change', () => {
      if (/^\d{4}$/.test(pinIn.value.trim())) Store.updateChild(c.id, { pin: pinIn.value.trim() });
      else { pinIn.value = c.pin; alert('The PIN must be exactly 4 digits.'); }
    });

    app.append(el('div', { class: 'card', style: `border-left:6px solid ${c.colour};margin-bottom:14px` },
      el('div', { class: 'row', style: 'gap:14px' },
        el('span', { class: 'avatar sm', style: `background:${c.colour}22` }, c.avatar),
        el('div', { style: 'flex:1;min-width:180px' },
          el('h3', { style: 'margin:0' }, c.name),
          el('span', { class: 'faint' }, `Level ${lvl.n} ${lvl.title} · ${c.xp} XP · ${c.streak || 0} day streak`))),
      el('div', { class: 'stat', style: 'margin:16px 0' },
        el('div', {}, el('b', {}, attempted), el('span', {}, 'topics tried')),
        el('div', {}, el('b', {}, secure), el('span', {}, 'secure (≥70%)')),
        el('div', {}, el('b', {}, mastered), el('span', {}, 'mastered (≥90% ×2)')),
        el('div', {}, el('b', {}, c.history.length), el('span', {}, 'rounds played'))),
      el('div', { class: 'row' },
        el('div', {}, el('label', {}, 'Year group'), yearSel),
        el('div', {}, el('label', {}, 'PIN'), pinIn),
        el('div', { style: 'align-self:flex-end' },
          el('button', {
            class: 'danger small', onclick: () => {
              if (confirm(`Delete ${c.name}’s profile and all progress? This cannot be undone.`)) {
                Store.removeChild(c.id); if (State.childId === c.id) State.childId = null; renderParent();
              }
            }
          }, 'Delete')))
    ));
  });

  const io = el('div', { class: 'card' },
    el('h3', {}, 'Backup and restore'),
    el('p', { class: 'faint' }, 'Progress lives in this browser. If you clear site data or move to another device, restore from a backup file.'),
    el('div', { class: 'row' },
      el('button', {
        class: 'quiet', onclick: () => {
          const blob = new Blob([Store.exportAll()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `wonder-academy-backup-${Store.today()}.json`;
          document.body.appendChild(a); a.click(); a.remove();
        }
      }, 'Download backup'),
      (() => {
        const f = el('input', { type: 'file', accept: '.json', style: 'display:none' });
        f.addEventListener('change', () => {
          const file = f.files[0]; if (!file) return;
          const rd = new FileReader();
          rd.onload = () => {
            try { Store.importAll(rd.result); alert('Backup restored.'); renderParent(); }
            catch (e) { alert('Could not restore: ' + e.message); }
          };
          rd.readAsText(file);
        });
        const b = el('button', { class: 'quiet', onclick: () => f.click() }, 'Restore backup');
        return el('span', {}, b, f);
      })(),
      el('button', {
        class: 'ghost', onclick: () => renderSetup()
      }, '+ Add a learner')
    )
  );
  app.append(io);
}

/* ---------------------------------------------------------------- boot -- */
function boot() {
  const missing = [];
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(y => {
    SUBJECTS.forEach(s => { if (!skillsFor(s.id, y).length) missing.push(s.id + ' Y' + y); });
  });
  if (missing.length) console.warn('Wonder Academy: no content for', missing.join(', '));
  Store.load();
  renderProfiles();
}

document.addEventListener('DOMContentLoaded', boot);
