// Curriculum access. The schemes of work ship as versioned static JSON in the
// repo rather than DB rows — they are content, and content wants git history,
// diffs and atomic deploy. The DB stores only lesson_id / component_id /
// curriculum_v so a child's history stays readable after a lesson is edited.

import { parseJson } from './util.js';

const cache = new Map();

export async function loadCurriculum(env, curriculumId) {
  if (cache.has(curriculumId)) return cache.get(curriculumId);
  const data = await env.readCurriculum(curriculumId);
  const indexed = indexCurriculum(data);
  cache.set(curriculumId, indexed);
  return indexed;
}

/** Flatten the nested scheme of work into lookup maps plus an ordered lesson list. */

// Exam administration is a fact the adult planning the year needs. It is not
// something to teach a fourteen-year-old, and drilling it spends retrievals that
// should have gone on reading. Recognised here, at the one place the scheme
// becomes lessons, so it can never reach a child or the review queue.
const EXAM_ADMIN = /\bAO[1-4]\b|assessment objective|% of the GCSE|\bmark schemes?\b|\bexaminer\b|^\s*(Component|Paper) \d (is|lasts|is worth|assesses|covers)|\bSPaG\b/i;
const EXAM_LESSON = /assessment objective|shape of gcse|the two papers|^induction\b|how you are assessed|exam structure|^baseline assessment\b|^question \d\b|^mock\b/i;

export function indexCurriculum(data) {
  const lessons = [];
  const lessonById = new Map();
  const componentsByLesson = new Map();
  const componentById = new Map();
  const subjects = [];

  for (const subject of data.subjects || []) {
    subjects.push({
      id: subject.id,
      name: subject.name,
      strand: subject.strand || 'core',
      board: subject.board || null,
      specCode: subject.specCode || null,
      tier: subject.tier || null,
    });

    for (const term of subject.terms || []) {
      for (const week of term.weeks || []) {
        for (const lesson of week.lessons || []) {
          if (EXAM_LESSON.test(lesson.title || '')) continue;
          if (lesson.audience === 'teacher' || lesson.active === false) continue;
          const record = {
            ...lesson,
            subject: subject.id,
            subjectName: subject.name,
            strand: subject.strand || 'core',
            termId: term.id,
            termName: term.name,
            week: week.week,
            unit: week.unit,
            phonicsPhase: week.phonicsPhase || null,
            gpcs: week.gpcs || null,
            commonExceptionWords: week.commonExceptionWords || null,
          };
          lessons.push(record);
          lessonById.set(lesson.id, record);
        }

        for (const kc of week.knowledgeComponents || []) {
          if (EXAM_ADMIN.test(kc.statement || '')) continue;
          if (kc.audience === 'teacher' || kc.active === false) continue;
          const lessonId = kc.lesson || (week.lessons?.[0]?.id ?? null);
          const record = {
            ...kc,
            subject: subject.id,
            strand: subject.strand || 'core',
            termId: term.id,
            week: week.week,
            lesson_id: lessonId,
            item_type: mapItemType(kc.type),
          };
          componentById.set(kc.id, record);
          if (lessonId) {
            if (!componentsByLesson.has(lessonId)) componentsByLesson.set(lessonId, []);
            componentsByLesson.get(lessonId).push(record);
          }
        }
      }
    }
  }

  return {
    meta: {
      child: data.child,
      yearGroup: data.yearGroup,
      generatedFor: data.generatedFor,
      noTimeTarget: !!data.noTimeTarget,
      sourceNotes: data.sourceNotes,
    },
    subjects,
    lessons,
    lessonById,
    componentById,
    componentsByLesson,
  };
}

/**
 * The curriculum files use pedagogical type names; the SR engine uses the
 * A–F taxonomy. Mapping is deliberately conservative — anything unrecognised
 * becomes a concept, which is graded against a rubric rather than string-matched.
 */
function mapItemType(type) {
  switch ((type || '').toLowerCase()) {
    case 'fact': case 'gpc': case 'word': return 'A';
    case 'procedure': case 'skill': return 'B';
    case 'discrimination': return 'D';
    case 'concept': default: return 'C';
  }
}

/** Default fluency targets, in ms, by item type and key stage. */
export function targetLatency(itemType, keyStage) {
  if (itemType === 'A') return keyStage === 'ks1' ? 5000 : 3000;
  if (itemType === 'B') return keyStage === 'ks1' ? 20000 : keyStage === 'ks3' ? 20000 : 30000;
  if (itemType === 'D') return 10000;
  return null;   // concepts are not graded on speed
}

/** Where the child is up to: the next unstarted lesson per subject. */
export async function nextLessons(env, child, curriculum) {
  const done = await env.DB.prepare(
    `SELECT lesson_id, MAX(status) AS status FROM lesson_attempts
     WHERE child_id = ? GROUP BY lesson_id`
  ).bind(child.id).all();

  const completed = new Set(
    (done.results || []).filter((r) => r.status === 'completed').map((r) => r.lesson_id));

  const bySubject = new Map();
  for (const lesson of curriculum.lessons) {
    if (completed.has(lesson.id)) continue;
    if (!bySubject.has(lesson.subject)) bySubject.set(lesson.subject, lesson);
  }
  return bySubject;
}
