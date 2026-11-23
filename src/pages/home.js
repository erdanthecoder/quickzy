// home.js — the front door: join a game, or make one.

import { h, fill, svg } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { scanForPin } from '../ui/qr.js';
import { navigate } from '../router.js';
import { MODES, modeArt } from '../game/modes/index.js';
import { signedIn } from '../services/session.js';
import { popularQuizzes, quizzesBy } from '../services/quizzes.js';
import { OFFICIAL_UID } from '../config.js';
import { quizCard, cover, authorLine } from './parts.js';
import { ornamentBand } from '../ui/ornament.js';

export function joinBox() {
  const pin = h('input', {
    class: 'input input-xl', inputmode: 'numeric', autocomplete: 'off', maxlength: 6,
    placeholder: 'Game PIN', 'aria-label': 'Game PIN',
  });
  const go = h('button', { class: 'btn btn-main btn-lg btn-block' }, 'Enter');
  const submit = () => {
    const v = pin.value.replace(/\D/g, '');
    if (v.length !== 6) { pin.classList.add('is-bad'); pin.focus(); return; }
    navigate(`/join/${v}`);
  };
  pin.addEventListener('input', () => {
    pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
    pin.classList.remove('is-bad');
  });
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  go.addEventListener('click', submit);
  return h('div', { class: 'join-box' },
    h('h2', {}, 'Join a game'),
    pin,
    go,
    h('button', { class: 'btn btn-block', onclick: async () => { const p = await scanForPin(); if (p) navigate(`/join/${p}`); } },
      icon('camera'), 'Scan a QR code'),
  );
}

export default async function Home() {
  const popular = h('div', { class: 'grid' });
  popularQuizzes(8).then((list) => {
    if (!list.length) {
      popular.replaceWith(h('div', { class: 'card flat empty' },
        h('h3', {}, 'No public quizzes yet'),
        h('p', {}, 'Be the first: make one and publish it.'),
        h('a', { class: 'btn btn-main', href: signedIn() ? '/create' : '/signup' }, 'Make a quiz')));
      return;
    }
    popular.append(...list.map(quizCard));
  }).catch(() => popular.replaceWith(h('p', { class: 'muted' }, 'Quizzes could not be loaded right now.')));

  // one official quiz a day, the same for everyone that day
  const daily = h('div');
  const inviteSlot = h('div');
  const installSlot = h('div');
  import('../ui/install.js').then((m) => {
    const draw = () => fill(installSlot, m.canInstall() ? h('div', { class: 'install-card' },
      icon('download', { size: 22 }), h('div', { class: 'grow' }, h('b', {}, 'Get the Quickzy app'), h('small', {}, 'Play quizzes anywhere, even with no internet. Free.')),
      h('a', { class: 'btn btn-main btn-sm', href: '/app' }, 'Get it')) : null);
    draw(); m.onInstallChange(draw);
  }).catch(() => {});
  import('../services/invite.js').then((m) => fill(inviteSlot, m.inviteCard())).catch(() => {});
  quizzesBy(OFFICIAL_UID).then((list) => {
    if (!list.length) return;
    const day = Math.floor(Date.now() / 86400000);
    const q = [...list].sort((a, b) => a.id.localeCompare(b.id))[day % list.length];
    const c = cover(q);
    c.classList.add('daily-cover');
    fill(daily, h('section', { class: 'daily card' },
      c,
      h('div', { class: 'stack grow', style: { gap: '8px' } },
        h('span', { class: 'pill pill-zing', style: { justifySelf: 'start' } }, icon('star', { size: 14 }), 'Quiz of the day'),
        h('h2', {}, q.title),
        h('p', { class: 'muted', style: { margin: 0 } }, q.description),
        authorLine(q, { size: 24 }),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-main', href: `/practice/${q.id}` }, icon('play', { size: 18 }), 'Play now'),
          h('a', { class: 'btn', href: `/host/${q.id}` }, icon('users', { size: 18 }), 'Host it')))));
  }).catch(() => {});

  // sections slide in as they scroll into view
  setTimeout(() => {
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.08 }) : null;
    document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('is-in')));
  }, 0);

  const rail = h('div', { class: 'hm-rail' },
    ...MODES.map((m) => h('div', { class: 'mode-card', style: { background: m.bg } },
      h('span', { class: 'mode-stage' }, h('span', { class: 'mode-spot' }), modeArt(m.id)),
      h('span', { class: 'mode-text' }, h('h3', {}, m.name), h('p', {}, m.tagline)),
      m.isNew ? h('span', { class: 'pro-tag is-new' }, 'NEW') : m.proOnly ? h('span', { class: 'pro-tag' }, 'PRO') : null)));
  const nudge = (dir) => rail.scrollBy({ left: dir * Math.min(rail.clientWidth * 0.8, 600), behavior: 'smooth' });

  return h('div', { class: 'page hm' },
    h('section', { class: 'hm-hero' },
      h('div', { class: 'hm-hero-copy' },
        h('span', { class: 'hm-eyebrow' }, h('i'), 'Quiz games for classrooms and friends'),
        h('h1', {}, 'Questions in.', h('br'), h('span', {}, 'Games out.')),
        h('p', { class: 'hm-lede' }, 'Write a quiz and Quickzy turns it into a live game on the big screen: a race, a laser battle, a train journey across the mountains. Everyone plays on their own phone with a PIN.'),
        h('div', { class: 'hm-cta' },
          h('a', { class: 'btn btn-main btn-lg', href: signedIn() ? '/new' : '/signup' }, 'Create a quiz', icon('arrowRight', { size: 18 })),
          h('a', { class: 'btn btn-lg hm-ghost', href: '/discover' }, 'Browse quizzes')),
        pinStrip()),
      liveDemo()),

    daily,

    h('section', { class: 'hm-steps reveal' },
      h('h2', { class: 'hm-h2' }, 'One quiz, three minutes, a whole room playing.'),
      h('ol', {},
        ...[['Write it', 'Type your questions, or let AI draft them for you. Pictures and videos welcome.'],
          ['Share the PIN', 'It goes up on the big screen. Phones join in seconds: no app, no account.'],
          ['Play it as a game', 'Every right answer moves you on. The leaderboard does the rest.']]
          .map(([t, d], i) => h('li', {}, h('b', {}, String(i + 1).padStart(2, '0')), h('h3', {}, t), h('p', {}, d))))),

    h('section', { class: 'hm-modes reveal' },
      h('div', { class: 'hm-modes-head' },
        h('div', {}, h('h2', { class: 'hm-h2' }, `${MODES.length} ways to play`), h('p', { class: 'muted' }, 'Same quiz, a different game every time.')),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'hm-arrow', 'aria-label': 'Back', onclick: () => nudge(-1) }, icon('arrowRight', { size: 18 })),
          h('button', { class: 'hm-arrow', 'aria-label': 'More', onclick: () => nudge(1) }, icon('arrowRight', { size: 18 })))),
      rail),

    h('section', { class: 'hm-bento reveal' },
      h('a', { class: 'hm-tile hm-tile-app', href: '/app' },
        h('small', {}, 'Quickzy app'), h('h3', {}, 'Plays offline.'), h('p', {}, 'Solo quizzes on the bus, on a plane, anywhere. For phones and Windows.'),
        h('div', { class: 'hm-tile-phone' }, h('i'), h('i'), h('i'), h('i'))),
      h('a', { class: 'hm-tile hm-tile-present', href: signedIn() ? '/present' : '/pro' },
        h('small', {}, 'Presentation+'), h('h3', {}, 'Slides that ask back.'), h('p', {}, 'Teach with slides, then drop a live question in the middle.'),
        h('div', { class: 'hm-slide' }, h('b'), h('i'), h('i'), h('span'))),
      h('a', { class: 'hm-tile hm-tile-blooks', href: '/blooks' },
        h('small', {}, 'Blooks'), h('h3', {}, 'Collect them all.'), h('p', {}, 'Earn coins by playing, open packs, find the legendaries.'),
        h('div', { class: 'hm-blook-row' }, ...['dragon', 'unicorn', 'fox', 'astronaut', 'cupcake'].map((id) => blook(id, 54)))),
      h('a', { class: 'hm-tile hm-tile-ai', href: signedIn() ? '/new' : '/signup' },
        h('small', {}, 'Make with AI'), h('h3', {}, 'A quiz from one sentence.'), h('p', {}, 'Describe the topic, paste the reply, edit what you like.')),
      h('a', { class: 'hm-tile hm-tile-safe', href: '/teachers' },
        h('small', {}, 'For schools'), h('h3', {}, 'No ads. No chat. No accounts for kids.'), h('p', {}, 'Players only see names and scores, and hosts can remove anyone.'))),

    installSlot,
    inviteSlot,

    h('div', { class: 'section-head' },
      h('h2', { class: 'hm-h2' }, 'Popular right now'),
      h('a', { href: '/discover', class: 'btn btn-sm' }, 'See all', icon('arrowRight', { size: 16 }))),
    popular,

    h('footer', { class: 'site-foot' },
      ornamentBand({ count: 9, height: 22 }),
      h('div', { class: 'site-foot-row' },
        h('b', {}, 'Quickzy'),
        h('nav', {}, h('a', { href: '/discover' }, 'Discover'), h('a', { href: '/app' }, 'App'), h('a', { href: '/teachers' }, 'For teachers'), h('a', { href: '/pro' }, 'Pro'),
          h('a', { href: '/terms' }, 'Terms'), h('a', { href: '/privacy' }, 'Privacy'))),
      h('small', {}, `© ${new Date().getFullYear()} Quickzy · Made with care in Kyrgyzstan`)),
  );
}

/** "Got a PIN?" on one line, right under the headline. */
function pinStrip() {
  const pin = h('input', { class: 'hm-pin-input', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, placeholder: 'Game PIN', 'aria-label': 'Game PIN' });
  const submit = () => {
    const v = pin.value.replace(/\D/g, '');
    if (v.length !== 6) { pin.classList.add('is-bad'); pin.focus(); return; }
    navigate(`/join/${v}`);
  };
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); pin.classList.remove('is-bad'); });
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div', { class: 'hm-pin' },
    h('span', {}, 'Got a PIN?'),
    pin,
    h('button', { class: 'hm-pin-go', onclick: submit, 'aria-label': 'Join' }, 'Join'),
    h('button', { class: 'hm-pin-scan', title: 'Scan a QR code', 'aria-label': 'Scan a QR code', onclick: async () => { const p = await scanForPin(); if (p) navigate(`/join/${p}`); } }, icon('camera', { size: 18 })));
}

/* ------------------------------------------------- the live game in the hero */

const SHAPES = {
  tri: 'M12 3 22 20H2Z', dia: 'M12 2 22 12 12 22 2 12Z', circ: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', sq: 'M3 3h18v18H3Z',
};
const shape = (k) => svg('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' }, svg('path', { d: SHAPES[k], fill: 'currentColor' }));

const DEMO = [
  { q: 'Which planet is the largest?', a: ['Mars', 'Jupiter', 'Venus', 'Earth'], right: 1 },
  { q: 'What is the capital of Kyrgyzstan?', a: ['Osh', 'Karakol', 'Bishkek', 'Naryn'], right: 2 },
  { q: 'How many legs does a spider have?', a: ['6', '10', '12', '8'], right: 3 },
];
const PLAYERS = [['Aigerim', 'fox'], ['Timur', 'robot'], ['Sofia', 'unicorn'], ['Bek', 'dragon'], ['Mira', 'penguin']];

/** A pretend game on a pretend big screen: answers arrive, the right one lights up, the scores shuffle. */
function liveDemo() {
  const qEl = h('div', { class: 'hm-q' });
  const timer = h('b', { class: 'hm-timer' });
  const count = h('small', {});
  const answers = h('div', { class: 'hm-answers' });
  const board = h('ol', { class: 'hm-board' });
  const scores = PLAYERS.map(([name, b], i) => ({ name, b, score: 2400 - i * 310 }));
  const screen = h('div', { class: 'hm-screen', 'aria-label': 'An example game', role: 'img' },
    h('div', { class: 'hm-screen-top' }, h('span', { class: 'hm-live' }, h('i'), 'LIVE'), count, h('span', { class: 'hm-pinbadge' }, 'PIN 482 913'), timer),
    qEl, answers, board);
  let round = 0;
  const kinds = ['tri', 'dia', 'circ', 'sq'];
  const run = () => {
    if (!screen.isConnected && round > 0) return;
    const d = DEMO[round % DEMO.length];
    count.textContent = `Question ${(round % DEMO.length) + 1} of 10`;
    qEl.textContent = d.q;
    screen.classList.remove('is-reveal', 'is-board');
    const votes = [0, 0, 0, 0];
    const tiles = [];
    const bars = d.a.map((text, i) => {
      const fillEl = h('i');
      const n = h('em', {}, '0');
      tiles.push(h('div', { class: `hm-ans hm-ans-${i}${i === d.right ? ' is-right' : ''}` }, h('span', { class: 'hm-shape' }, shape(kinds[i])), h('span', { class: 'hm-ans-t' }, text), n, fillEl));
      return { fillEl, n };
    });
    fill(answers, ...tiles);
    let t = 8;
    timer.textContent = String(t);
    const tick = setInterval(() => {
      if (!screen.isConnected) { clearInterval(tick); return; }
      // answers trickle in, mostly right
      for (let k = 0; k < 2; k++) { const pick = Math.random() < 0.55 ? d.right : Math.floor(Math.random() * 4); votes[pick] += 1; }
      const total = votes.reduce((x, y) => x + y, 0);
      votes.forEach((v, i) => { bars[i].n.textContent = String(v); bars[i].fillEl.style.width = `${(v / total) * 100}%`; });
      t -= 1; timer.textContent = String(Math.max(0, t));
      if (t <= 0) {
        clearInterval(tick);
        screen.classList.add('is-reveal');
        setTimeout(() => {
          scores.forEach((p) => { p.score += Math.random() < 0.7 ? 600 + Math.floor(Math.random() * 400) : 0; });
          scores.sort((x, y) => y.score - x.score);
          fill(board, ...scores.slice(0, 4).map((p, i) => h('li', { style: { '--d': `${i * 0.08}s` } }, h('span', { class: 'hm-rank' }, String(i + 1)), blook(p.b, 28), h('span', { class: 'grow' }, p.name), h('b', {}, p.score.toLocaleString()))));
          screen.classList.add('is-board');
          setTimeout(() => { round += 1; run(); }, 2600);
        }, 1500);
      }
    }, 600);
  };
  setTimeout(run, 300);
  return h('div', { class: 'hm-stage' },
    screen,
    h('div', { class: 'hm-phone', 'aria-hidden': 'true' },
      h('div', { class: 'hm-phone-in' }, ...kinds.map((k, i) => h('span', { class: `hm-ans-${i}` }, shape(k))))));
}
