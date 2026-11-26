// tools/seed-admin.mjs — publish the official quizzes (tools/quizzes.mjs) as
// the official Quickzy account, from GitHub Actions, with the Firebase
// service account (no password needed). Run by .github/workflows/seed.yml.
//
// Each quiz has a fixed id (quickzy-<slug>): running again updates it and
// keeps its play count. Every question is checked with the editor's rules
// first; one bad question stops everything.

import { QUIZZES } from './quizzes.mjs';
import { COVER_PHOTOS } from './covers.mjs';
import { split, problem } from '../src/game/questions.js';
import { words } from '../src/services/quizzes.js';
import { OFFICIAL_UID } from '../src/config.js';

let bad = 0;
for (const q of QUIZZES) {
  q.questions.forEach((x, i) => { const p = problem(x); if (p) { bad++; console.log(`${q.slug} #${i + 1}: ${p}`); } });
  if (q.questions.length < 5) { bad++; console.log(`${q.slug}: fewer than 5 questions`); }
}
if (bad) process.exit(1);
console.log(`${QUIZZES.length} quizzes, ${QUIZZES.reduce((n, q) => n + q.questions.length, 0)} questions, all valid`);
if (process.argv.includes('--dry')) process.exit(0);

const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.PROJECT || 'akylduukodo' });
const db = admin.firestore();
const profile = (await db.doc(`users/${OFFICIAL_UID}`).get()).data();
if (!profile || !profile.username) { console.error('The official account has no profile.'); process.exit(1); }

let added = 0;
let updated = 0;
for (const q of QUIZZES) {
  const id = `quickzy-${q.slug}`;
  const { pub, key } = split(q.questions);
  const ref = db.doc(`quizzes/${id}`);
  const before = await ref.get();
  const data = {
    owner: OFFICIAL_UID, title: q.title, description: q.description, cover: q.cover,
    ...(COVER_PHOTOS[q.slug] ? { image: COVER_PHOTOS[q.slug] } : {}),
    questions: pub, questionCount: pub.length, big: pub.length >= 5, public: true,
    keywords: words(`${q.title} ${q.description} ${pub.map((x) => x.text).join(' ')}`),
    authorName: profile.displayName, authorUsername: profile.username, authorBlook: profile.blook,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!before.exists) Object.assign(data, { plays: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  // the answers first, so the quiz is never public without them
  await db.doc(`quizzes/${id}/private/key`).set({ owner: OFFICIAL_UID, answers: JSON.stringify(key) });
  await ref.set(data, { merge: before.exists });
  if (before.exists) updated++; else added++;
}
console.log(`Official quizzes: ${added} new, ${updated} updated`);
process.exit(0);
