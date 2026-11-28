// pro.js — Quickzy Pro: what it gives, what it costs, and the thank-you
// letter members receive.

import { h } from '../ui/dom.js';
import { icon, logo, verifiedBadge } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { modal } from '../ui/kit.js';
import { signedIn, myProfile, me } from '../services/session.js';
import { myPlan, membership, PRICE, PRO_PERKS, PRO_SOON, PLANS, trialOn, TRIAL_ENDS, proOpen, startTestPro, stopTestPro } from '../services/plan.js';
import { navigate } from '../router.js';
import { celebrate } from '../ui/confetti.js';
import { sfx } from '../game/sound.js';
import { pageTitle } from './parts.js';

/** The letter. Shown once when someone becomes Pro, and any time from here. */
export function proLetter() {
  const p = myProfile() || {};
  sfx('reveal');
  setTimeout(() => celebrate(['#ffcd1f', '#ffe45c', '#ffffff', '#6b4cff']), 300);
  return modal((close) => [h('div', { class: 'letter' },
    h('div', { class: 'letter-seal' }, logo()),
    h('p', { class: 'letter-to' }, `Dear ${p.displayName || 'friend'},`),
    h('p', {}, 'Thank you for becoming a Quickzy Pro member. You are one of the people who keep Quickzy growing: every quiz you make and every game you host makes it better for everyone who plays.'),
    h('p', {}, 'Your gold PRO badge now shines next to your name. Your quizzes go live the moment you publish them, your games hold up to 100 players, and every game mode is yours to host.'),
    h('p', {}, 'We are building more for you: video quizzes, making quizzes together, and brand new games. You will be the first to play them.'),
    h('p', { class: 'letter-sign' }, 'With thanks,', h('br'), h('b', {}, 'Erdan and the Quickzy team')),
    h('button', { class: 'btn btn-main btn-block', onclick: () => close() }, 'Thank you!'))], { wide: false });
}

/** After someone turns Pro, show the letter once on this device. */
export async function maybeShowLetter() {
  if (!signedIn()) return;
  const key = `quickzy.proLetter.${me().uid}`;
  try { if (localStorage.getItem(key)) return; } catch { return; }
  const m = await membership(me().uid);
  if (!m || m.plan !== 'pro' || (m.until || 0) < Date.now()) return;
  try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
  proLetter();
}

/**
 * The pretend checkout on the test site: it looks and feels like paying, but
 * no money moves. Card 4242 4242 4242 4242 is approved; 4000 0000 0000 0002
 * is declined, to try what happens when a payment fails.
 */
function fakeCheckout() {
  const p = myProfile() || {};
  return modal((close) => {
    const card = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'off', value: '4242 4242 4242 4242', 'aria-label': 'Card number' });
    const exp = h('input', { class: 'input', value: '12 / 34', 'aria-label': 'Expiry date' });
    const cvc = h('input', { class: 'input', value: '123', inputmode: 'numeric', 'aria-label': 'Security code' });
    const name = h('input', { class: 'input', value: p.displayName || '', 'aria-label': 'Name on card' });
    const msg = h('p', { class: 'fc-msg', 'aria-live': 'polite' });
    const pay = h('button', { class: 'btn btn-main btn-lg btn-block' }, icon('lock', { size: 16 }), 'Pay $0.00 today');
    card.addEventListener('input', () => { card.value = card.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
    pay.addEventListener('click', async () => {
      const digits = card.value.replace(/\D/g, '');
      msg.className = 'fc-msg'; msg.textContent = '';
      if (digits.length !== 16 || !name.value.trim()) { msg.className = 'fc-msg is-bad'; msg.textContent = 'Fill in the card and the name.'; return; }
      pay.disabled = true;
      for (const step of ['Talking to the bank… (pretend)', 'Checking the card… (pretend)']) { pay.textContent = step; await new Promise((r) => setTimeout(r, 700)); }
      if (digits === '4000000000000002') {
        sfx('wrong'); pay.disabled = false; pay.replaceChildren(icon('lock', { size: 16 }), 'Try again');
        msg.className = 'fc-msg is-bad'; msg.textContent = 'Card declined (test card). Nothing was charged.';
        return;
      }
      sfx('coin'); pay.replaceChildren(icon('check', { size: 16 }), 'Payment approved!');
      setTimeout(() => close('paid'), 600);
    });
    return [h('div', { class: 'fc' },
      h('div', { class: 'fc-top' }, h('b', {}, 'Quickzy Pay'), h('span', { class: 'fc-test' }, 'TEST · no real money')),
      h('div', { class: 'fc-order' },
        h('div', {}, h('b', {}, 'Quickzy Pro'), h('small', {}, `7 days free, then ${PRICE} a year`)),
        h('div', { class: 'fc-today' }, h('small', {}, 'Today'), h('b', {}, '$0.00'))),
      h('label', { class: 'fc-field' }, h('small', {}, 'Card number'), card),
      h('div', { class: 'fc-row' }, h('label', { class: 'fc-field' }, h('small', {}, 'Expiry'), exp), h('label', { class: 'fc-field' }, h('small', {}, 'CVC'), cvc)),
      h('label', { class: 'fc-field' }, h('small', {}, 'Name on card'), name),
      msg, pay,
      h('small', { class: 'fc-note' }, 'Test site: this is pretend. Use 4000 0000 0000 0002 to try a declined card.'))];
  });
}

export default async function Pro() {
  // hidden for now: only the test address shows the Pro page
  if (!proOpen()) { queueMicrotask(() => navigate('/', { replace: true })); return h('div'); }
  pageTitle('Quickzy Pro');
  const plan = await myPlan();
  // payments are not connected yet: the test site pays with pretend money
  const getPro = async () => {
    if (!signedIn()) { navigate('/login?next=/pro'); return; }
    if (await fakeCheckout() !== 'paid') return;
    startTestPro();
    // the letter is shown right here, not again after the reload
    try { localStorage.setItem(`quickzy.proLetter.${me().uid}`, '1'); } catch { /* ignore */ }
    await proLetter();
    location.reload();
  };
  const m = plan.pro && signedIn() ? await membership(me().uid) : null;
  const perk = ([ic, title, text], soon = false) => h('li', { class: soon ? 'is-soon' : '' },
    h('span', { class: 'pro-ic' }, icon(ic, { size: 18 })),
    h('div', {}, h('b', {}, title, soon ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, 'Coming soon') : null), h('small', {}, text)));
  const free = PLANS.free;
  return h('div', { class: 'page stack', style: { gap: '22px' } },
    h('section', { class: 'pro-hero' },
      h('div', { class: 'pro-hero-badge' }, verifiedBadge(null, 'pro'), 'PRO'),
      h('h1', {}, 'Quickzy Pro'),
      h('p', {}, 'For the people who make Quickzy great. Quizzes checked within a day, host every game for up to 100 players, and wear the gold badge.'),
      trialOn() ? h('div', { class: 'pro-trial' }, icon('star', { size: 18 }),
        `Free test: everyone gets Pro until ${new Date(TRIAL_ENDS).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`) : null,
      plan.pro
        ? h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('span', { class: 'pro-member' }, icon('check', { size: 18 }), m && m.until ? `You are a Pro member until ${new Date(m.until).toLocaleDateString()}` : trialOn() ? 'You have Pro in the free test' : 'You are a Pro member'),
          h('button', { class: 'btn', onclick: () => proLetter() }, icon('mail', { size: 16 }), 'Read your letter'),
          m && m.test ? h('button', { class: 'btn', onclick: () => { stopTestPro(); location.reload(); } }, 'Stop test Pro') : null)
        : h('div', { class: 'pro-price' },
          h('div', { class: 'pro-trial' }, icon('star', { size: 18 }), 'Try it 7 days free'),
          h('b', {}, PRICE), h('span', {}, 'a year, after 7 free days. Cancel any time.'),
          h('button', { class: 'btn btn-main btn-lg', onclick: getPro }, 'Start my free week'),
          h('small', {}, 'Test site: you pay with pretend money, so you can try it.'))),
    h('div', { class: 'pro-cols' },
      h('section', { class: 'card stack' }, h('h2', {}, 'What Pro members get'), h('ul', { class: 'pro-list' }, ...PRO_PERKS.map((p) => perk(p)), ...PRO_SOON.map((p) => perk(p, true)))),
      h('section', { class: 'card stack' }, h('h2', {}, 'Free accounts'),
        h('ul', { class: 'pro-list is-free' },
          perk(['list', `${free.quizzes} quizzes`, 'Plenty to start with.']),
          perk(['users', `${free.players} players a game`, 'Great for one class.']),
          perk(['play', 'Classic, Robot Run, Sky Climb, Train Travel and Sky Race', 'Laser Tag and the Pro-only games are Pro.']),
          perk(['clock', 'Quizzes are checked', 'Published quizzes are checked automatically and go live in 3–5 days.'])),
        h('div', { class: 'row', style: { justifyContent: 'center', gap: '10px' } }, ...['fox', 'unicorn', 'dragon', 'kyrgyzstan'].map((id) => blook(id, 56))))));
}
