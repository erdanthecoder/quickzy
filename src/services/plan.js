// plan.js — Free and Pro.
//
// Who is Pro lives in members/{uid} {plan, until}, which only the site owner
// can write. The owner is always Pro. Payments are not connected for now, and
// the Pro page only shows on the test address (proOpen).

import { net } from '../net/index.js';
import { me, signedIn, setProFlag } from './session.js';
import { OWNER_UID, BADGES, PRO_FREE, TEST_HOST } from '../config.js';

export const PRICE = '$13.49';

/** The free test ended early, on 20 Nov 2026: now only the owner, the
 *  accounts in PRO_FREE (and later, paying members) are Pro. The security
 *  rules hold the same list. */
export const TRIAL_ENDS = Date.UTC(2026, 10, 20, 18, 0, 0);
export const trialOn = (now = Date.now()) => now < TRIAL_ENDS && !testsWithoutTrial();
// the browser tests check the free plan too: on localhost only, they can switch the test off
function testsWithoutTrial() {
  try {
    return ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('quickzy.test.noTrial') === '1';
  } catch { return false; }
}

export const PLANS = {
  free: {
    quizzes: 10, players: 40, modes: ['classic', 'robotrun', 'obby', 'train', 'skyrace', 'pizza'],
    minutes: [3, 5, 7, 10], reviewDays: 3,
  },
  pro: {
    quizzes: 300, players: 100, modes: ['classic', 'lasertag', 'robotrun', 'obby', 'train', 'skyrace', 'treasure', 'candy', 'pizza', 'grandprix'],
    minutes: [3, 5, 7, 10, 15, 20, 30], reviewDays: 0,
  },
};

export const PRO_PERKS = [
  ['check', 'Gold PRO badge', 'Next to your name on every quiz, channel and game.'],
  ['globe', 'Checked within a day', 'Your quizzes are checked and go live within a day. Free quizzes wait 3–5 days.'],
  ['users', 'Up to 100 players', 'Free games hold 40.'],
  ['star', 'Pro-only games', 'Treasure Hunt and Candy Factory: only Pro members can host them.'],
  ['play', 'Every game mode', 'Laser Tag too, and games up to 30 minutes.'],
  ['list', '300 quizzes', 'Free accounts can make 10.'],
  ['star', 'Custom blooks and flags', 'All three custom blook slots and every part unlocked, plus the country flag blooks.'],
  ['play', 'Video quizzes', 'A YouTube clip plays, stops, and then the question is asked.'],
  ['edit', 'Make quizzes together', 'Invite anyone, even free accounts, to edit a quiz with you.'],
  ['book', 'More classes', 'Teachers: up to 50 classes of 300 students. Free teachers get 2 classes of 100.'],
  ['mail', 'A thank-you letter', 'A personal letter from Quickzy, just for members.'],
];
export const PRO_SOON = [];

const cache = new Map();
const known = new Map();      // answers already in, for code that cannot wait

/** Pro, for the signed-in account, if we already know (false until then). */
export const proNow = () => Boolean(signedIn() && known.get(me().uid));

/** Is this account Pro right now? */
export function isPro(uid) {
  if (!uid) return Promise.resolve(false);
  if (uid === OWNER_UID || BADGES[uid] === 'official' || PRO_FREE.includes(uid)) { known.set(uid, true); return Promise.resolve(true); }
  if (trialOn()) { known.set(uid, true); if (me() && me().uid === uid) setProFlag(true); return Promise.resolve(true); }
  if (!cache.has(uid)) {
    // Firestore holds the members the owner gave Pro to
    cache.set(uid, net.store.get('members', uid)
      .then((m) => Boolean(m && m.plan === 'pro' && (m.until || 0) > Date.now()))
      .catch(() => false)
      .then((v) => { known.set(uid, v); if (me() && me().uid === uid) setProFlag(v); return v; }));
  }
  return cache.get(uid);
}
export const forget = (uid) => { cache.delete(uid); known.delete(uid); };

/** Who has Pro: members/{uid}, given by the owner. (Payments are not connected.) */
export async function membership(uid) {
  if (!uid) return null;
  return net.store.get('members', uid).catch(() => null);
}

/**
 * Quickzy Pro is hidden for now: it is only shown (the Pro page, the Get Pro
 * buttons) on the test address and on a computer running Quickzy for
 * testing. Everywhere else the gold PRO badges stay, and Pro-only things say
 * "coming soon". People who already have Pro keep it everywhere.
 */
export const proOpen = () => typeof location === 'undefined' || location.hostname === TEST_HOST
  || /^(localhost|127\.)/.test(location.hostname) || Boolean(location.port);
export const PRO_COMING = 'Quickzy Pro is coming soon!';

/** The plan of whoever is signed in. */
export async function myPlan() {
  const pro = signedIn() && await isPro(me().uid);
  return { pro, ...(pro ? PLANS.pro : PLANS.free) };
}

/** The owner turns Pro on (for a year) or off. */
export async function setPro(uid, on) {
  if (on) await net.store.set('members', uid, { plan: 'pro', since: Date.now(), until: Date.now() + 365 * 86400000 });
  else await net.store.del('members', uid);
  cache.delete(uid);
}
