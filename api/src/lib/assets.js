// The schemes of work ship as JSON files beside the Functions code. They are
// content, not user data — they want git history and atomic deploy, and reading
// them from disk keeps the database holding only ids.
//
// Each file is a few megabytes, parsed once per warm instance and then cached by
// loadCurriculum().

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CURRICULUM_DIR = path.resolve(here, '../../curriculum');

const ALLOWED = new Set(['year2', 'year7', 'year10']);

export async function readCurriculum(curriculumId) {
  if (!ALLOWED.has(curriculumId)) throw new Error(`unknown curriculum: ${curriculumId}`);
  const raw = await readFile(path.join(CURRICULUM_DIR, `${curriculumId}.json`), 'utf8');
  return JSON.parse(raw);
}
