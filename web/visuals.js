// The board.
//
// The teacher talks; this is what the child looks at while it does. Everything
// here is drawn from a small JSON spec the agent supplies mid-lesson, so it
// works for any of the 1,548 lessons without anyone authoring artwork for each.
//
// Two rules shape all of it. Mayer's redundancy principle: never put the
// teacher's own sentences on screen — spoken words plus identical written words
// is measurably worse than speech alone. And signalling: show the one thing
// being talked about, large, with the part under discussion emphasised.

const NS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** KaTeX is fetched on first use — most lessons never need it. */
let katexReady = null;
function loadKatex() {
  if (katexReady) return katexReady;
  katexReady = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js';
    js.onload = () => resolve(window.katex);
    js.onerror = () => resolve(null);       // fall back to plain text
    document.head.appendChild(js);
  });
  return katexReady;
}

/** Readable-enough plain text for when KaTeX is unavailable. */
function plainMaths(latex) {
  return String(latex)
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\times/g, '×').replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±').replace(/\\cdot/g, '·')
    .replace(/\\le/g, '≤').replace(/\\ge/g, '≥').replace(/\\neq/g, '≠')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/[{}]/g, '').replace(/\\[a-zA-Z]+/g, '').trim();
}

function maths(el, latex, display = true) {
  el.textContent = plainMaths(latex);
  loadKatex().then((katex) => {
    if (!katex) return;
    try {
      katex.render(latex, el, { displayMode: display, throwOnError: false });
    } catch { /* leave the plain text */ }
  });
}

// ───────────────────────────── renderers ─────────────────────────────

const R = {};

/** The resting state: what the lesson is about. Never a blank screen. */
R.title = (s) => `
  <div class="v-title">
    ${s.eyebrow ? `<p class="v-eyebrow">${esc(s.eyebrow)}</p>` : ''}
    <h2>${esc(s.title || '')}</h2>
    ${s.points?.length ? `<ul class="v-points">${s.points.map((p) =>
      `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
  </div>`;

/** A word, big, with its meaning. Seeing the spelling while hearing the sound
 *  is how the two get mapped to each other — it matters most for the youngest. */
R.term = (s) => `
  <div class="v-term">
    <p class="v-eyebrow">${esc(s.eyebrow || 'New word')}</p>
    <p class="v-term__word">${esc(s.word || '')}</p>
    ${s.phonetic ? `<p class="v-term__say">${esc(s.phonetic)}</p>` : ''}
    ${s.definition ? `<p class="v-term__def">${esc(s.definition)}</p>` : ''}
  </div>`;

/** A worked example. Steps arrive one at a time so the child follows rather
 *  than reads ahead — that is the segmenting principle doing its job. */
R.steps = (s) => `
  <div class="v-steps" data-shown="${s.shown ?? s.steps?.length ?? 0}">
    ${s.title ? `<p class="v-eyebrow">${esc(s.title)}</p>` : ''}
    <ol>
      ${(s.steps || []).map((st, i) => `
        <li class="v-step" data-i="${i}">
          <div class="v-step__body">${
            typeof st === 'string'
              ? esc(st)
              : `${st.maths ? `<span class="v-maths" data-latex="${esc(st.maths)}"></span>` : ''}
                 ${st.text ? `<span class="v-step__why">${esc(st.text)}</span>` : ''}`
          }</div>
        </li>`).join('')}
    </ol>
  </div>`;

/** One equation, large. */
R.equation = (s) => `
  <div class="v-equation">
    ${s.caption ? `<p class="v-eyebrow">${esc(s.caption)}</p>` : ''}
    <div class="v-maths v-maths--big" data-latex="${esc(s.latex || s.maths || '')}"></div>
  </div>`;

/** A number line: ticks, a highlighted point or range, optional jumps. */
R.numberline = (s) => {
  const from = Number(s.from ?? 0), to = Number(s.to ?? 10);
  const step = Number(s.step ?? 1);
  const W = 880, H = 190, pad = 60;
  const x = (v) => pad + ((v - from) / (to - from || 1)) * (W - pad * 2);

  const ticks = [];
  for (let v = from; v <= to + 1e-9; v += step) {
    const major = Math.abs(v % (step * (s.majorEvery ?? 1))) < 1e-9;
    ticks.push(`<line x1="${x(v)}" y1="${H / 2 - (major ? 16 : 9)}"
                      x2="${x(v)}" y2="${H / 2 + (major ? 16 : 9)}" class="v-tick"/>
      ${major ? `<text x="${x(v)}" y="${H / 2 + 44}" class="v-tick__label">${
        Number(v.toFixed(4))}</text>` : ''}`);
  }

  const jumps = (s.jumps || []).map((j, i) => {
    const a = x(j.from), b = x(j.to), mid = (a + b) / 2;
    const up = i % 2 === 0 ? -1 : 1;
    const y = H / 2 + up * 6;
    return `<path d="M ${a} ${y} Q ${mid} ${y + up * 62} ${b} ${y}"
                  class="v-jump" marker-end="url(#vArrow)"/>
            <text x="${mid}" y="${y + up * 76}" class="v-jump__label">${esc(j.label ?? '')}</text>`;
  }).join('');

  const marks = (s.marks || []).map((m) => {
    const v = typeof m === 'object' ? m.at : m;
    return `<circle cx="${x(v)}" cy="${H / 2}" r="11" class="v-mark"/>
      ${typeof m === 'object' && m.label
        ? `<text x="${x(v)}" y="${H / 2 - 30}" class="v-mark__label">${esc(m.label)}</text>` : ''}`;
  }).join('');

  return `<figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" class="v-svg" role="img"
         aria-label="${esc(s.caption || `number line from ${from} to ${to}`)}">
      <defs><marker id="vArrow" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" class="v-arrowhead"/></marker></defs>
      <line x1="${pad - 24}" y1="${H / 2}" x2="${W - pad + 24}" y2="${H / 2}" class="v-axis"/>
      ${ticks.join('')}${jumps}${marks}
    </svg>
  </figure>`;
};

/** Fraction bars — one row per fraction, so comparison is visual not arithmetic. */
R.fraction = (s) => {
  const rows = s.bars || [{ numerator: s.numerator, denominator: s.denominator, label: s.label }];
  return `<figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-bars">
      ${rows.map((b) => {
        const d = Math.max(1, Number(b.denominator) || 1);
        const n = Math.min(d, Number(b.numerator) || 0);
        return `<div class="v-bar__row">
          <span class="v-bar__label">${esc(b.label ?? `${n}/${d}`)}</span>
          <span class="v-bar">${Array.from({ length: d }, (_, i) =>
            `<span class="v-bar__part${i < n ? ' is-on' : ''}"></span>`).join('')}</span>
        </div>`;
      }).join('')}
    </div>
  </figure>`;
};

/** A rectangular array — times tables, area, grouping. */
R.array = (s) => {
  const rows = Math.max(1, Math.min(20, Number(s.rows) || 1));
  const cols = Math.max(1, Math.min(20, Number(s.cols) || 1));
  return `<figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-array" style="--cols:${cols}">
      ${Array.from({ length: rows * cols }, (_, i) =>
        `<span class="v-cell${(s.shaded ?? rows * cols) > i ? ' is-on' : ''}"></span>`).join('')}
    </div>
    <p class="v-array__sum">${rows} × ${cols} = <strong>${rows * cols}</strong></p>
  </figure>`;
};

/** A process: boxes and arrows. Photosynthesis, the water cycle, a method. */
R.process = (s) => `
  <figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-process">
      ${(s.stages || []).map((st, i) => `
        ${i ? '<span class="v-process__arrow" aria-hidden="true">→</span>' : ''}
        <span class="v-process__box${st.emphasis ? ' is-on' : ''}">
          <span class="v-process__t">${esc(st.label ?? st)}</span>
          ${st.note ? `<span class="v-process__n">${esc(st.note)}</span>` : ''}
        </span>`).join('')}
    </div>
  </figure>`;

/** A labelled diagram: a shape with callouts. Cell, plant, circuit, map. */
R.labelled = (s) => {
  const W = 880, H = 520;
  const shape = s.shape === 'circle'
    ? `<ellipse cx="${W / 2}" cy="${H / 2}" rx="230" ry="170" class="v-shape"/>`
    : s.shape === 'leaf'
      ? `<path d="M ${W / 2} 90 C ${W / 2 + 240} 160, ${W / 2 + 240} 400, ${W / 2} 450
                  C ${W / 2 - 240} 400, ${W / 2 - 240} 160, ${W / 2} 90 Z" class="v-shape"/>`
      : `<rect x="${W / 2 - 220}" y="${H / 2 - 150}" width="440" height="300" rx="24" class="v-shape"/>`;

  // Callouts place themselves: alternating sides, spread top to bottom, with the
  // marker inside the shape on the same side as its label so leaders never cross.
  const list = s.parts || [];
  const perSide = Math.ceil(list.length / 2);
  const parts = list.map((p, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const spread = perSide > 1 ? row / (perSide - 1) : 0.5;
    const labelY = 110 + spread * (H - 220);
    const tx = side < 0 ? 34 : W - 34;
    const anchor = side < 0 ? 'start' : 'end';
    const px = p.x != null ? W / 2 + Number(p.x) : W / 2 + side * (70 + row * 34);
    const py = p.y != null ? Number(p.y) : H / 2 + (spread - 0.5) * (H * 0.46);
    // Start the leader past the end of the word rather than at its anchor, or
    // the line runs straight through the label. 21px display bold averages a
    // little over half its size per character; the +12 is the breathing gap.
    const label = String(p.label ?? p);
    const runOn = label.length * 11.5 + 16;
    const lx = side < 0 ? Math.min(tx + runOn, px - 12) : Math.max(tx - runOn, px + 12);
    return `<line x1="${lx}" y1="${labelY - 6}" x2="${px}" y2="${py}" class="v-lead"/>
            <circle cx="${px}" cy="${py}" r="7" class="v-mark"/>
            <text x="${tx}" y="${labelY}" text-anchor="${anchor}" class="v-label">${esc(p.label ?? p)}</text>
            ${p.note ? `<text x="${tx}" y="${labelY + 21}" text-anchor="${anchor}"
              class="v-label__note">${esc(p.note)}</text>` : ''}`;
  }).join('');

  return `<figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" class="v-svg" role="img"
         aria-label="${esc(s.caption || 'labelled diagram')}">${shape}${parts}</svg>
  </figure>`;
};

/** Sorting — the discrimination item made visual. Phonics families, which
 *  method applies, classifying anything. */
R.sort = (s) => `
  <figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-sort">
      ${(s.columns || []).map((col) => `
        <div class="v-sort__col">
          <p class="v-sort__head">${esc(col.heading ?? '')}</p>
          <ul>${(col.items || []).map((it) => `<li>${esc(it)}</li>`).join('')}</ul>
        </div>`).join('')}
    </div>
  </figure>`;

/** Big grapheme cards, for Sophia. */
R.graphemes = (s) => `
  <figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-graphemes">
      ${(s.items || []).map((g) => `
        <span class="v-grapheme${g.emphasis ? ' is-on' : ''}">
          <span class="v-grapheme__g">${esc(g.grapheme ?? g)}</span>
          ${g.example ? `<span class="v-grapheme__e">${esc(g.example)}</span>` : ''}
        </span>`).join('')}
    </div>
  </figure>`;

/** A quotation or passage, with the part under discussion picked out. */
R.quote = (s) => {
  let html = esc(s.text || '');
  for (const h of s.highlight || []) {
    html = html.split(esc(h)).join(`<mark>${esc(h)}</mark>`);
  }
  return `<figure class="v-fig v-quote">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <blockquote>${html}</blockquote>
    ${s.source ? `<cite>${esc(s.source)}</cite>` : ''}
  </figure>`;
};

R.table = (s) => `
  <figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-tablewrap"><table class="v-table">
      ${s.headings?.length ? `<thead><tr>${s.headings.map((h) =>
        `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${(s.rows || []).map((r) =>
        `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </figure>`;

/** A bar chart. Deliberately plain: one accent, a value on each bar, no grid
 *  furniture, because the point is the comparison and nothing else. */
R.chart = (s) => {
  const data = s.data || [];
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return `<figure class="v-fig">
    ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
    <div class="v-chart">
      ${data.map((d) => `
        <div class="v-chart__col">
          <span class="v-chart__v">${esc(d.value)}</span>
          <span class="v-chart__bar${d.emphasis ? ' is-on' : ''}"
                style="height:${Math.round((Number(d.value) || 0) / max * 100)}%"></span>
          <span class="v-chart__l">${esc(d.label ?? '')}</span>
        </div>`).join('')}
    </div>
  </figure>`;
};

/** Anything genuinely graph-shaped. Mermaid is only fetched if asked for. */
R.mermaid = (s) => `<figure class="v-fig">
  ${s.caption ? `<figcaption class="v-eyebrow">${esc(s.caption)}</figcaption>` : ''}
  <pre class="v-mermaid">${esc(s.code || '')}</pre></figure>`;

let mermaidReady = null;
function renderMermaid(root) {
  const nodes = root.querySelectorAll('.v-mermaid');
  if (!nodes.length) return;
  if (!mermaidReady) {
    mermaidReady = new Promise((resolve) => {
      const js = document.createElement('script');
      js.src = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js';
      js.onload = () => { window.mermaid?.initialize({ startOnLoad: false, theme: 'neutral' }); resolve(window.mermaid); };
      js.onerror = () => resolve(null);
      document.head.appendChild(js);
    });
  }
  mermaidReady.then(async (mermaid) => {
    if (!mermaid) return;
    for (const [i, node] of [...nodes].entries()) {
      try {
        const { svg } = await mermaid.render(`m${Date.now()}${i}`, node.textContent);
        node.outerHTML = `<div class="v-svgwrap">${svg}</div>`;
      } catch { /* leave the source visible rather than an empty box */ }
    }
  });
}

// ───────────────────────────── the board ─────────────────────────────

export const VISUAL_KINDS = Object.keys(R);

/**
 * Draw a spec onto an element. Unknown kinds fall back to the title card rather
 * than leaving the child looking at nothing.
 */
export function drawVisual(root, spec) {
  if (!root) return 'no board';
  const kind = R[spec?.kind] ? spec.kind : 'title';
  root.innerHTML = `<div class="v-board__inner">${R[kind](spec || {})}</div>`;

  root.querySelectorAll('.v-maths').forEach((el) => {
    const latex = el.dataset.latex || '';
    if (latex) maths(el, latex, el.classList.contains('v-maths--big'));
  });
  renderMermaid(root);

  // Steps arrive one at a time unless the caller asks for all of them.
  const steps = root.querySelector('.v-steps');
  if (steps) {
    const shown = Number(steps.dataset.shown);
    steps.querySelectorAll('.v-step').forEach((li, i) => {
      li.classList.toggle('is-hidden', i >= shown);
    });
  }

  root.classList.remove('is-entering');
  void root.offsetWidth;                 // restart the transition
  root.classList.add('is-entering');
  return `showing ${kind}`;
}

/** Reveal the next step of a worked example. */
export function revealNextStep(root) {
  const steps = root?.querySelector('.v-steps');
  if (!steps) return 'nothing to reveal';
  const hidden = steps.querySelector('.v-step.is-hidden');
  if (!hidden) return 'all steps are already shown';
  hidden.classList.remove('is-hidden');
  hidden.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return 'revealed the next step';
}
