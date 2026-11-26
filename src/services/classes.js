// classes.js — classrooms: a teacher makes a class, students join it with a
// class code, and the teacher posts announcements, game PINs, homework and
// one-question quizzes to everyone in it.
//
//   classes/{cid}                        {owner, ownerName, name, school, code, members[], teachers[], color, createdAt}
//   classcodes/{CODE}                    {cid, owner}            (codes are unique)
//   classes/{cid}/people/{uid}           {name, username, blook, role, code?, at}
//   classes/{cid}/posts/{pid}            {by, byName, kind, text, pin?, hwId?, title?, dueAt?, options?, answer?, at}
//   classes/{cid}/posts/{pid}/answers/{uid}  {name, choice, at}
//
// Who is who (account type, chosen when signing up):
//   kid      — under 18: blooks, boxes, games, joins classes with a code
//   personal — 18+, for themselves: everything as before
//   teacher  — 18+, for teaching: makes classes too

import { net } from '../net/index.js';
import { me, myProfile, signedIn } from './session.js';
import { OWNER_UID, released14 } from '../config.js';
import { isClean } from './names.js';

export const MEMBERS_MAX = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The account type: 'kid', 'personal' or 'teacher' ('' = not asked yet). */
export const useOf = (p = myProfile()) => (p && p.use) || '';
export const isCreator = () => Boolean(me() && me().uid === OWNER_UID);
/** Teachers (and the creator) can make classes. */
export const canTeach = () => isCreator() || useOf() === 'teacher';
/** Classes are part of Quickzy 1.4; the creator can try them early. */
export const classesOpen = () => released14() || isCreator();

export const randomCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
export function codeProblem(code) {
  if (code.length < 4) return 'A class code has 4 to 10 letters or numbers.';
  if (!isClean(code.toLowerCase())) return 'Pick a different code.';
  return '';
}

const myName = () => String((myProfile() || {}).displayName || 'Teacher').slice(0, 30);
const person = (p, role, extra = {}) => ({
  name: String(p.displayName || p.username || 'Student').slice(0, 30),
  username: String(p.username || '').slice(0, 20),
  blook: String(p.blook || 'fox').slice(0, 20),
  role, at: net.store.serverTime(), ...extra,
});

export const getClass = (cid) => net.store.get('classes', cid).catch(() => null);

/** Every class I teach or am in, newest first. */
export async function myClasses() {
  if (!signedIn()) return [];
  const uid = me().uid;
  const [own, taught, joined] = await Promise.all([
    net.store.query('classes', { where: [['owner', '==', uid]], limit: 50 }).catch(() => []),
    net.store.query('classes', { where: [['teachers', 'array-contains', uid]], limit: 50 }).catch(() => []),
    net.store.query('classes', { where: [['members', 'array-contains', uid]], limit: 50 }).catch(() => []),
  ]);
  const by = new Map();
  for (const c of [...own, ...taught, ...joined]) by.set(c.id, c);
  return [...by.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export const teaches = (c) => Boolean(c && me() && (c.owner === me().uid || (c.teachers || []).includes(me().uid)));
export const inClass = (c) => Boolean(c && me() && (teaches(c) || (c.members || []).includes(me().uid)));

async function freeCode(wanted) {
  if (wanted) {
    const taken = await net.store.get('classcodes', wanted).catch(() => null);
    if (taken) throw new Error('That class code is taken. Try another.');
    return wanted;
  }
  for (let i = 0; i < 8; i++) {
    const c = randomCode();
    if (!(await net.store.get('classcodes', c).catch(() => null))) return c;
  }
  throw new Error('Could not make a class code. Try again.');
}

export async function createClass({ name, school, code, color = 0 }) {
  if (!canTeach()) throw new Error('Only teacher accounts can make classes.');
  const n = String(name || '').trim().slice(0, 60);
  if (!n) throw new Error('Give your class a name.');
  if (!isClean(n)) throw new Error('Pick a different class name.');
  const wanted = cleanCode(code);
  if (wanted && codeProblem(wanted)) throw new Error(codeProblem(wanted));
  const c = await freeCode(wanted);
  const cid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await net.store.batch([
    { op: 'set', col: 'classes', id: cid, data: {
      owner: me().uid, ownerName: myName(), name: n,
      school: String(school || (myProfile() || {}).school || '').trim().slice(0, 80),
      code: c, members: [], teachers: [], color: Math.max(0, Math.min(7, color | 0)), createdAt: net.store.serverTime(),
    } },
    { op: 'set', col: 'classcodes', id: c, data: { cid, owner: me().uid } },
  ]);
  return cid;
}

/** A new code for the class (the old one stops working). */
export async function setCode(c, next) {
  const wanted = cleanCode(next) || '';
  if (wanted && codeProblem(wanted)) throw new Error(codeProblem(wanted));
  if (wanted && wanted === c.code) return c.code;
  const code = await freeCode(wanted);
  await net.store.batch([
    { op: 'set', col: 'classcodes', id: code, data: { cid: c.id, owner: me().uid } },
    { op: 'update', col: 'classes', id: c.id, data: { code } },
    { op: 'del', col: 'classcodes', id: c.code },
  ]);
  return code;
}

export async function renameClass(c, { name, school }) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) throw new Error('Give your class a name.');
  if (!isClean(n)) throw new Error('Pick a different class name.');
  await net.store.update('classes', c.id, { name: n, school: String(school || '').trim().slice(0, 80) });
}

export async function deleteClass(c) {
  const posts = await net.store.query(`classes/${c.id}/posts`, { limit: 300 }).catch(() => []);
  for (const p of posts) await net.store.del(`classes/${c.id}/posts`, p.id).catch(() => {});
  const people = await net.store.query(`classes/${c.id}/people`, { limit: 300 }).catch(() => []);
  for (const p of people) await net.store.del(`classes/${c.id}/people`, p.id).catch(() => {});
  await net.store.batch([
    { op: 'del', col: 'classcodes', id: c.code },
    { op: 'del', col: 'classes', id: c.id },
  ]);
}

/** Find a class by its code (to show it before joining). */
export async function findByCode(code) {
  const k = cleanCode(code);
  if (k.length < 4) return null;
  const row = await net.store.get('classcodes', k).catch(() => null);
  if (!row) return null;
  const c = await getClass(row.cid);
  return c && c.code === k ? c : null;
}

export async function join(code) {
  if (!signedIn()) throw new Error('Sign in to join a class.');
  const c = await findByCode(code);
  if (!c) throw new Error('No class has that code. Check it with your teacher.');
  if (inClass(c)) return c.id;
  if ((c.members || []).length >= MEMBERS_MAX) throw new Error('That class is full.');
  const uid = me().uid;
  await net.store.batch([
    { op: 'set', col: `classes/${c.id}/people`, id: uid, data: person(myProfile() || {}, 'student', { code: c.code }) },
    { op: 'update', col: 'classes', id: c.id, data: { members: [...(c.members || []), uid] } },
  ]);
  return c.id;
}

export async function leave(c) {
  const uid = me().uid;
  await net.store.batch([
    { op: 'update', col: 'classes', id: c.id, data: { members: (c.members || []).filter((m) => m !== uid) } },
    { op: 'del', col: `classes/${c.id}/people`, id: uid },
  ]);
}

export const people = (cid) => net.store.query(`classes/${cid}/people`, { limit: 300 }).catch(() => []);

/** The teacher adds someone by username, as a student or as another teacher. */
export async function addPerson(c, username, role = 'student') {
  const name = String(username || '').toLowerCase().replace(/^@/, '').trim();
  if (!name) throw new Error('Type their username.');
  const row = await net.store.get('usernames', name).catch(() => null);
  if (!row) throw new Error(`Nobody is called @${name}.`);
  const uid = row.uid;
  if (uid === c.owner) throw new Error('That is the class teacher.');
  const p = await net.store.get('users', uid).catch(() => null);
  if (!p) throw new Error(`Nobody is called @${name}.`);
  if (role === 'teacher' && c.owner !== me().uid) throw new Error('Only the class owner can add teachers.');
  const members = (c.members || []).filter((m) => m !== uid);
  const teachers = (c.teachers || []).filter((m) => m !== uid);
  if (role === 'teacher') teachers.push(uid); else members.push(uid);
  if (members.length > MEMBERS_MAX) throw new Error('That class is full.');
  const patch = role === 'teacher' || (c.teachers || []).includes(uid) ? { members, teachers } : { members };
  await net.store.batch([
    { op: 'set', col: `classes/${c.id}/people`, id: uid, data: person(p, role) },
    { op: 'update', col: 'classes', id: c.id, data: patch },
  ]);
  return { uid, ...p };
}

export async function removePerson(c, uid) {
  const patch = { members: (c.members || []).filter((m) => m !== uid) };
  if ((c.teachers || []).includes(uid)) patch.teachers = c.teachers.filter((m) => m !== uid);
  await net.store.batch([
    { op: 'update', col: 'classes', id: c.id, data: patch },
    { op: 'del', col: `classes/${c.id}/people`, id: uid },
  ]);
}

/* ------------------------------------------------------------- the stream */

export const posts = (cid) => net.store.query(`classes/${cid}/posts`, { orderBy: ['at', 'desc'], limit: 60 }).catch(() => []);

/** kind: note | game | homework | question */
export async function post(cid, kind, fields) {
  const text = String(fields.text || '').trim().slice(0, 1000);
  if (kind === 'note' && !text) throw new Error('Write something to announce.');
  if (text && !isClean(text)) throw new Error('Please change some words in your announcement.');
  const data = { by: me().uid, byName: myName(), kind, text, at: net.store.serverTime() };
  if (kind === 'game') {
    const pin = String(fields.pin || '').replace(/\D/g, '');
    if (pin.length !== 6) throw new Error('A game PIN has 6 numbers.');
    data.pin = pin;
    data.title = String(fields.title || 'Live game').slice(0, 80);
  }
  if (kind === 'homework') {
    data.hwId = String(fields.hwId || '').slice(0, 60);
    data.title = String(fields.title || 'Homework').slice(0, 80);
    data.dueAt = Number(fields.dueAt) || 0;
  }
  if (kind === 'question') {
    if (!text) throw new Error('Write the question.');
    const options = (fields.options || []).map((o) => String(o || '').trim().slice(0, 90)).filter(Boolean);
    if (options.length < 2) throw new Error('Give at least 2 answers.');
    if (options.some((o) => !isClean(o))) throw new Error('Please change some words in the answers.');
    const answer = Number(fields.answer);
    if (!(answer >= 0 && answer < options.length)) throw new Error('Tap the right answer.');
    data.options = options.slice(0, 4);
    data.answer = answer;
  }
  return net.store.add(`classes/${cid}/posts`, data);
}

export const deletePost = (cid, pid) => net.store.del(`classes/${cid}/posts`, pid);

/* ------------------------------------------- one-question quizzes in posts */

export const answers = (cid, pid) => net.store.query(`classes/${cid}/posts/${pid}/answers`, { limit: 300 }).catch(() => []);
export const myAnswer = (cid, pid) => net.store.get(`classes/${cid}/posts/${pid}/answers`, me().uid).catch(() => null);
export async function answer(cid, pid, choice) {
  await net.store.set(`classes/${cid}/posts/${pid}/answers`, me().uid, {
    name: String((myProfile() || {}).displayName || 'Student').slice(0, 30), choice: choice | 0, at: net.store.serverTime(),
  });
}

/* ------------------------------------------------ the sign-up questions */

export const HEARD = [
  ['friend', 'A friend'], ['teacher', 'My teacher or school'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'],
  ['instagram', 'Instagram'], ['search', 'Google or a search'], ['family', 'Family'], ['other', 'Somewhere else'],
];

/** Save the answers: the account type (public) and how they heard + age (private). */
export async function saveAbout({ heard, age, use, school }) {
  const { patchProfile } = await import('./session.js');
  const a = Math.round(Number(age));
  await net.store.set('about', me().uid, { heard: String(heard || 'other').slice(0, 40), age: a, at: net.store.serverTime() });
  const fields = { use };
  if (use === 'teacher') fields.school = String(school || '').trim().slice(0, 80);
  await patchProfile(fields);
}

/** School names other teachers already typed (to pick from). */
export async function knownSchools() {
  const rows = await net.store.query('users', { where: [['use', '==', 'teacher']], limit: 300 }).catch(() => []);
  const seen = new Map();
  for (const r of rows) {
    const s = String(r.school || '').trim();
    if (s && isClean(s)) seen.set(s.toLowerCase(), s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The owner panel: how people found Quickzy. */
export const allAbout = () => net.store.query('about', { limit: 1000 }).catch(() => []);
