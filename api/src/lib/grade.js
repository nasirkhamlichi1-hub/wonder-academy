// Grading a child's answer.
//
// The teacher is a live voice agent, so most answers arrive as an ASR transcript
// of a child speaking. That is a noisy channel, and the failure mode that matters
// — marking a child wrong because the recogniser misheard — is far more damaging
// than the reverse. Everything here is built around that asymmetry.
//
//   audio -> ASR -> normalisation -> grader -> confidence gate -> grade | clarify | defer
//
// Facts, procedures and discrimination items are graded deterministically after
// normalisation: no LLM call, no latency, no chance of a model inventing a
// disagreement. Only open concept answers go to the model.

import { json, err, parseJson } from './util.js';

// ───────────────────────── normalisation ─────────────────────────

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, million: 1000000,
};

const FILLERS = /\b(um+|uh+|er+|erm+|like|you know|i think|maybe|kind of|sort of|well)\b/gi;

// Substitutions the recogniser and a child's mouth actually produce. Grading the
// physics, not the phrasing, means these must never cost a mark.
const ALIASES = [
  [/\bsine\b/gi, 'sin'], [/\bsign\b/gi, 'sin'],
  [/\bco sine\b/gi, 'cos'], [/\btan gent\b/gi, 'tan'],
  [/\bsum\b/gi, 'some'],
  [/\bto the power of\b/gi, '^'], [/\bsquared\b/gi, '^2'], [/\bcubed\b/gi, '^3'],
  [/\bover\b/gi, '/'], [/\bdivided by\b/gi, '/'],
  [/\btimes\b/gi, '*'], [/\bmultiplied by\b/gi, '*'],
  [/\bplus\b/gi, '+'], [/\bminus\b/gi, '-'], [/\btake away\b/gi, '-'],
  [/\bequals\b/gi, '='], [/\bis equal to\b/gi, '='],
  [/\bpoint\b/gi, '.'],
  [/\bmetres per second squared\b/gi, 'm/s^2'],
  [/\bdegrees celsius\b/gi, '°c'],
  [/\ba half\b/gi, '1/2'], [/\bone half\b/gi, '1/2'],
  [/\ba quarter\b/gi, '1/4'], [/\ba third\b/gi, '1/3'],
];

export function normalise(text) {
  if (!text) return '';
  let t = ` ${String(text).toLowerCase()} `;

  // Take the FINAL stated answer, not the first: children self-correct mid-sentence.
  const corrected = t.split(/\b(?:no wait|sorry|i mean|actually|no,)\b/i);
  t = corrected[corrected.length - 1];

  t = t.replace(FILLERS, ' ');
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  t = wordsToNumbers(t);
  return t.replace(/[^\w\s^./*+\-=°<>%:]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordsToNumbers(text) {
  return text.replace(
    /\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)(?:[\s-]+and)?[\s-]*)+)\b/g,
    (match) => {
      // "one hundred and twenty" is how a child actually says 120.
      const parts = match.trim().split(/[\s-]+/).filter((w) => w in NUMBER_WORDS);
      if (!parts.length) return match;
      let total = 0, current = 0;
      for (const w of parts) {
        const v = NUMBER_WORDS[w];
        if (v === 100) current = (current || 1) * 100;
        else if (v >= 1000) { total += (current || 1) * v; current = 0; }
        else current += v;
      }
      return ` ${total + current} `;
    });
}

// ──────────────────── deterministic grading ────────────────────

/** Facts, procedures and discrimination items: exact match after normalisation. */
export function gradeClosed(given, expected) {
  const g = normalise(given);
  const accepted = (Array.isArray(expected) ? expected : [expected]).map(normalise);

  for (const a of accepted) {
    if (!a) continue;
    if (g === a) return { correct: true, partial: 1, confidence: 1 };
    // Answer buried in a sentence: "I think it's 24" -> 24
    if (new RegExp(`(^|\\s)${escapeRe(a)}($|\\s)`).test(g)) {
      return { correct: true, partial: 1, confidence: 0.95 };
    }
    // Numeric tolerance for computed answers
    const gn = Number(g.match(/-?\d+(\.\d+)?/)?.[0]);
    const an = Number(a.match(/-?\d+(\.\d+)?/)?.[0]);
    if (Number.isFinite(gn) && Number.isFinite(an)) {
      if (gn === an) return { correct: true, partial: 1, confidence: 0.95 };
      if (an !== 0 && Math.abs(gn - an) / Math.abs(an) < 0.001) {
        return { correct: true, partial: 1, confidence: 0.9 };
      }
    }
  }

  // Semantically incoherent short transcripts are more likely mis-heard than
  // mis-understood. Ask again rather than marking wrong.
  const asrSuspect = g.length > 0 && g.length < 3;
  return { correct: false, partial: 0, confidence: asrSuspect ? 0.4 : 0.9, asr_suspect: asrSuspect };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ───────────────────── open-answer grading ─────────────────────

const GRADER_SYSTEM = `You mark a child's spoken answer against a rubric.

RULES
- Grade the idea, not the phrasing. Child vocabulary, grammar, hedging and
  incomplete sentences NEVER lose credit. Only the key points count.
- Quote the exact words from the transcript that earn each key point. If you
  cannot quote it, you cannot credit it.
- The transcript comes from speech recognition of a child. If it is incoherent
  in a way that suggests mishearing rather than misunderstanding, set
  asr_suspect true rather than marking it wrong.
- Note any listed misconception you actually see evidence for.
- Return JSON only. No prose.

Return exactly:
{"key_points_hit":["kp1"],"misconceptions":[],"partial":0.67,"correct":true,
 "confidence":0.86,"evidence":{"kp1":"quoted words"},"asr_suspect":false}`;

async function gradeOnce(env, rubric, transcript) {
  const text = await env.chat({
    messages: [
      { role: 'system', content: GRADER_SYSTEM },
      {
        role: 'user',
        content: `QUESTION: ${rubric.question}\n\nKEY POINTS:\n`
          + rubric.key_points.map((k) => `- ${k.id}: ${k.text}`).join('\n')
          + (rubric.misconceptions?.length
            ? `\n\nMISCONCEPTIONS TO WATCH FOR:\n`
              + rubric.misconceptions.map((m) => `- ${m.id}: ${m.text}`).join('\n')
            : '')
          + `\n\nCHILD'S ANSWER (speech transcript): "${transcript}"`,
      },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });
  const match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? parseJson(match[0], null) : null;
}

/**
 * k = 3 samples, majority vote. Published work on LLM graders finds they
 * systematically under-score with a single prompt, that low sample-agreement is
 * itself diagnostic of a wrong score, and that routing the uncertain tail to a
 * human cuts manual grading enormously while keeping most grades inside human
 * ranges. k = 3 is the pragmatic point on that curve for three children.
 */
export async function gradeOpen(env, rubric, rawTranscript) {
  const transcript = normalise(rawTranscript);
  if (!transcript) {
    return { correct: false, partial: 0, confidence: 0.2, action: 'clarify', asr_suspect: true };
  }

  const samples = (await Promise.all([
    gradeOnce(env, rubric, transcript).catch(() => null),
    gradeOnce(env, rubric, transcript).catch(() => null),
    gradeOnce(env, rubric, transcript).catch(() => null),
  ])).filter(Boolean);

  if (!samples.length) {
    return { correct: false, partial: 0, confidence: 0, action: 'defer', error: 'grader_unavailable' };
  }

  const threshold = rubric.pass_threshold ?? 0.67;
  const partials = samples.map((s) => Number(s.partial) || 0).sort((a, b) => a - b);
  const partial = partials[Math.floor(partials.length / 2)];        // median
  const spread = partials[partials.length - 1] - partials[0];
  const correctVotes = samples.filter((s) => s.correct).length;
  const confidence = samples.reduce((a, s) => a + (Number(s.confidence) || 0), 0) / samples.length;
  const asrSuspect = samples.filter((s) => s.asr_suspect).length >= 2;

  const misconceptions = [...new Set(samples.flatMap((s) => s.misconceptions || []))];
  const keyPointsHit = [...new Set(samples.flatMap((s) => s.key_points_hit || []))];
  const evidence = Object.assign({}, ...samples.map((s) => s.evidence || {}));

  // Confidence gate. A clarifying question is not a hint — the re-answer is
  // graded at scaffold level 0.
  let action = 'grade';
  if (asrSuspect || confidence < 0.7 || spread > 0.34 || (correctVotes === 1 || correctVotes === 2)) {
    action = 'clarify';
  }

  return {
    correct: partial >= threshold,
    partial,
    confidence,
    action,
    asr_suspect: asrSuspect,
    key_points_hit: keyPointsHit,
    misconceptions,
    evidence,
    samples: samples.length,
  };
}

/** Entry point used by the voice agent's submit_answer client tool. */
export async function gradeAnswer(env, { component, given, expected, rubric, attemptNumber = 1 }) {
  const type = component?.item_type || 'C';

  if (type === 'C' && rubric?.key_points?.length) {
    const result = await gradeOpen(env, rubric, given);
    // Second attempt after a clarification: grade it, don't loop forever.
    if (result.action === 'clarify' && attemptNumber >= 2) result.action = 'grade';
    return result;
  }

  const result = gradeClosed(given, expected ?? component?.statement);
  if (result.asr_suspect && attemptNumber < 2) result.action = 'clarify';
  else result.action = 'grade';
  return result;
}
