// tools/offline.mjs — makes the two files the offline app needs:
//
//   src/offline/library.js  the official quizzes with their answers, so the
//                           Quickzy app can play them with no internet
//   precache.js             every file of the app, which the service worker
//                           saves when Quickzy is installed
//
// Run it after changing the official quizzes or adding/removing files:
//   node tools/offline.mjs        (tests/check.mjs fails if you forget)

import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { QUIZZES } from './quizzes.mjs';
import { COVER_PHOTOS } from './covers.mjs';
import { split } from '../src/game/questions.js';

const ROOT = new URL('..', import.meta.url).pathname;

/** The same "random" every run, so the file only changes when quizzes do. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export function buildLibrary() {
  const rand = seeded(42);
  const list = QUIZZES.map((q) => {
    const { pub, key } = split(q.questions, rand);
    return {
      quiz: {
        id: `quickzy-${q.slug}`, title: q.title, description: q.description, cover: q.cover,
        ...(COVER_PHOTOS[q.slug] ? { image: COVER_PHOTOS[q.slug] } : {}),
        questions: pub, questionCount: pub.length, authorName: 'Quickzy', authorUsername: 'quickzy', authorBlook: 'robot',
      },
      key,
    };
  });
  return `// src/offline/library.js — made by tools/offline.mjs; do not edit by hand.\n// The official Quickzy quizzes, with answers, for playing offline.\n\nexport const LIBRARY = ${JSON.stringify(list)};\n`;
}

export function buildPrecache() {
  const files = ['/', '/index.html', '/app', '/manifest.webmanifest'];
  const walk = (dir) => {
    for (const f of readdirSync(join(ROOT, dir)).sort()) {
      const p = join(dir, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (!f.startsWith('.') && !f.endsWith('.md')) files.push(`/${relative('.', p)}`);
    }
  };
  ['src', 'styles', 'assets', 'vendor'].forEach(walk);
  return `// precache.js — made by tools/offline.mjs; do not edit by hand.\n// Every file of the app, saved by sw.js so Quickzy opens with no internet.\nself.PRECACHE = ${JSON.stringify(files, null, 0)};\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(ROOT, 'src/offline/library.js'), buildLibrary());
  // the library is one of the files, so write it first, then list everything
  writeFileSync(join(ROOT, 'precache.js'), buildPrecache());
  const n = JSON.parse(readFileSync(join(ROOT, 'precache.js'), 'utf8').split('= ')[1].replace(/;\s*$/, '')).length;
  console.log(`offline: ${QUIZZES.length} quizzes, ${n} files to save`);
}
