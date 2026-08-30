// Simulates a school year for each child, to check the load model against the
// real curriculum before three children live inside it for twelve months.
//
// Responses are drawn from FSRS's own predicted recall probability, so the lapse
// rate is self-consistent rather than something I picked.

import { fsrs, createEmptyCard, Rating, State, generatorParameters } from 'ts-fsrs';
import { readFile } from 'node:fs/promises';

const DAY = 86400000;
const SCHOOL_DAYS = 190;

const CHILDREN = [
  { id: 'sol',    curriculum: 'year10', minutes: 100, retention: 0.90, newPerDay: 17, reviewMin: 48, steps: ['5m', '25m'] },
  { id: 'isaac',  curriculum: 'year7',  minutes: 70,  retention: 0.85, newPerDay: 12, reviewMin: 31, steps: ['5m', '25m'] },
  { id: 'sophia', curriculum: 'year2',  minutes: 32,  retention: 0.85, newPerDay: 5,  reviewMin: 10, steps: ['3m', '15m'] },
];

// Seconds per item, by type. Facts are fast; a spoken concept answer with a
// follow-up "why" is not.
const COST = { A: 8, B: 25, C: 45, D: 10 };
const mapType = (t) => ({ fact: 'A', gpc: 'A', word: 'A', procedure: 'B', skill: 'B', concept: 'C' }[t] || 'C');

async function componentsFor(curriculumId) {
  const data = JSON.parse(await readFile(`api/curriculum/${curriculumId}.json`, 'utf8'));
  const out = [];
  for (const s of data.subjects || []) {
    for (const t of s.terms || []) {
      for (const w of t.weeks || []) {
        for (const kc of w.knowledgeComponents || []) {
          out.push({ id: kc.id, type: mapType(kc.type), subject: s.id });
        }
      }
    }
  }
  return out;
}

function simulate(child, components) {
  const scheduler = fsrs(generatorParameters({
    request_retention: child.retention,
    maximum_interval: 180,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: child.steps,
    relearning_steps: ['10m'],
  }));

  const reviewBudget = child.reviewMin * 60;   // minutes/day given to retrieval
  const cards = new Map();
  let introduced = 0;
  let start = Date.now();
  const daily = [];

  for (let d = 0; d < SCHOOL_DAYS; d++) {
    const at = new Date(start + d * DAY);
    let spent = 0;
    let reviews = 0, lapses = 0;

    // Due queue, at-risk first.
    const due = [...cards.values()]
      .filter((c) => c.card.due <= at)
      .map((c) => ({
        ...c,
        R: c.card.state === State.New ? 0 : scheduler.get_retrievability(c.card, at, false),
      }))
      .sort((a, b) => a.R - b.R);

    for (const item of due) {
      const cost = COST[item.type];
      if (spent + cost > reviewBudget) break;
      spent += cost;
      reviews++;

      // Answer drawn from the model's own predicted recall.
      const recalled = Math.random() < Math.max(0.05, item.R);
      // A scaffold is used on roughly a third of shaky answers, which caps the
      // rating at Hard — the same rule the live app applies.
      const scaffolded = !recalled ? false : Math.random() < 0.25;
      const rating = !recalled ? Rating.Again : scaffolded ? Rating.Hard
        : (Math.random() < 0.08 ? Rating.Easy : Rating.Good);
      if (rating === Rating.Again) lapses++;

      const { card } = scheduler.next(item.card, at, rating);
      cards.set(item.id, { ...item, card });
    }

    const overflow = due.length - reviews;

    // New items only if there is budget left after review.
    let added = 0;
    if (spent < reviewBudget * 1.2) {
      for (const c of components) {
        if (added >= child.newPerDay) break;
        if (cards.has(c.id)) continue;
        const card = createEmptyCard(at);
        const { card: next } = scheduler.next(card, at, Rating.Good);
        cards.set(c.id, { id: c.id, type: c.type, subject: c.subject, card: next });
        added++; introduced++;
      }
    }

    const mature = [...cards.values()].filter((c) => c.card.stability >= 21).length;
    daily.push({ d, reviews, dueCount: due.length, overflow, minutes: spent / 60, mature, introduced, lapses });
  }

  return { daily, cards, total: components.length };
}

const rows = [];
for (const child of CHILDREN) {
  const components = await componentsFor(child.curriculum);
  const { daily, cards, total } = simulate(child, components);
  const last30 = daily.slice(-30);
  const avg = (f) => last30.reduce((a, x) => a + f(x), 0) / last30.length;
  const end = daily[daily.length - 1];

  rows.push({
    child: child.id,
    'KCs in year': total,
    'introduced': end.introduced,
    'coverage': `${Math.round(100 * end.introduced / total)}%`,
    'needed/day': (total / SCHOOL_DAYS).toFixed(1),
    'actual/day': (end.introduced / SCHOOL_DAYS).toFixed(1),
    'reviews/day (last 30)': avg((x) => x.reviews).toFixed(0),
    'review min/day': avg((x) => x.minutes).toFixed(1),
    'budget min': (child.minutes * 0.4 * 0.55).toFixed(1),
    'overflow/day': avg((x) => x.overflow).toFixed(0),
    'mature at yr end': end.mature,
    'mature %': `${Math.round(100 * end.mature / Math.max(1, end.introduced))}%`,
  });
}

console.table(rows);
