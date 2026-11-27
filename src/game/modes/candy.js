// candy.js — Candy Factory (Pro): answer right for cash, buy machines,
// and your factory makes candy every second. Score = candy made.
// The host runs the factory, so prices and output can't be faked.

import { h, fill } from '../../ui/dom.js';
import { blook } from '../../ui/blooks.js';
import { sfx } from '../sound.js';

// [name, emoji colour, base cost, candy per second]
export const MACHINES = [
  ['Lollipop press', '#ff4772', 10, 1],
  ['Gummy mould', '#12c9a6', 45, 5],
  ['Chocolate river', '#8a5a2b', 160, 18],
  ['Cotton cloud', '#a560ff', 500, 55],
  ['Rainbow rocket', '#ffcd1f', 1500, 170],
];
// what each machine makes, shown on the belt and its card
const ART = ['🍭', '🍬', '🍫', '🍡', '🚀'];
const CANDY = ['🍭', '🍬', '🍫', '🍡', '🌈'];

export const costOf = (i, owned) => Math.round(MACHINES[i][2] * 1.18 ** owned);
export const cashFor = (rate) => 12 + Math.round(rate * 4);

/* ================================================================== host */

export function createHost({ players, dirty }) {
  const send = (p) => { p.meExtra = { ...(p.meExtra || {}), f: { c: Math.floor(p.extra.cash), r: p.extra.rate, m: p.extra.m.slice() } }; dirty.add(p.uid); };
  let last = 0;
  return {
    join(p) { if (!p.extra.m) { Object.assign(p.extra, { cash: 0, rate: 0, m: MACHINES.map(() => 0), summary: '0 candy' }); send(p); } },
    grant(p, ok) {
      if (!ok) return 0;
      const g = cashFor(p.extra.rate);
      p.extra.cash += g;
      send(p);
      return g;
    },
    act(p, a) {
      const i = Number(a.a);
      if (a.k !== 'b' || !Number.isInteger(i) || !MACHINES[i]) return;
      const e = p.extra;
      const cost = costOf(i, e.m[i]);
      if (e.cash < cost) return;
      e.cash -= cost; e.m[i] += 1; e.rate += MACHINES[i][3];
      send(p);
    },
    tick(now) {
      const secs = last ? Math.min(3, (now - last) / 1000) : 1;
      last = now;
      for (const p of players.values()) {
        if (!p.extra.rate) continue;
        p.score += Math.round(p.extra.rate * secs);
        p.extra.summary = `${p.score} candy · ${p.extra.rate}/s`;
        dirty.add(p.uid);
      }
    },
  };
}

/* ================================================================ player */

export function mountPlayer(game) {
  const { stage, uid, live, P } = game;
  let f = { c: 0, r: 0, m: MACHINES.map(() => 0) };
  game.grantText = (g) => `+$${g}`;
  const cashEl = h('b', { class: 'cf-cash' });
  const rateEl = h('b', { class: 'cf-rate' });
  const hint = h('p', { class: 'cf-hint' });
  const shop = h('div', { class: 'cf-shop' });
  const belt = h('div', { class: 'cf-belt' });
  const answer = h('button', { class: 'cf-answer' }, h('span', {}, '💵'), 'Answer for cash');
  const factory = h('div', { class: 'cf-factory' },
    h('div', { class: 'cf-roof' }, h('i'), h('i'), h('i')),
    h('div', { class: 'cf-sign' }, h('img', { class: 'game-logo', src: '/assets/icon.svg', alt: '' }), h('span', {}, '🍬'), 'Candy Factory'),
    h('div', { class: 'cf-stats' },
      h('div', {}, h('small', {}, 'Cash'), cashEl),
      h('div', {}, h('small', {}, 'Candy a second'), rateEl)),
    belt);
  stage.append(h('div', { class: 'cf-root' }, factory, answer, hint, shop));
  let shown = -1;
  const draw = () => {
    cashEl.textContent = `$${f.c.toLocaleString()}`;
    rateEl.textContent = `${f.r.toLocaleString()}`;
    fill(shop, ...MACHINES.map(([name, col, , per], i) => {
      const cost = costOf(i, f.m[i] || 0);
      const own = f.m[i] || 0;
      const can = f.c >= cost;
      const b = h('button', { class: `cf-machine${can ? ' is-ready' : ''}${own ? ' is-owned' : ''}`, disabled: !can, style: { '--c': col } },
        h('span', { class: 'cf-icon' }, ART[i]),
        own ? h('span', { class: 'cf-owned' }, `×${own}`) : null,
        h('b', {}, name), h('small', {}, `+${per} candy a second`),
        h('span', { class: 'cf-cost' }, can ? 'Buy ' : '', `$${cost.toLocaleString()}`),
        h('span', { class: 'cf-bar' }, h('i', { style: { width: `${Math.min(100, (f.c / cost) * 100)}%` } })));
      b.addEventListener('click', () => { game.sendAct({ k: 'b', a: i }); sfx('coin'); b.classList.add('is-bought'); });
      return b;
    }));
    // what to save up for next
    const next = MACHINES.map((m, i) => [i, costOf(i, f.m[i] || 0)]).filter(([, c]) => c > f.c).sort((a, b) => a[1] - b[1])[0];
    hint.textContent = !f.r ? 'Answer right for cash, then buy your first machine!'
      : next ? `Next: ${ART[next[0]]} ${MACHINES[next[0]][0]} in $${(next[1] - f.c).toLocaleString()} more` : 'You can buy something now!';
    // candy on the belt: more machines, more candy (up to 10)
    const kinds = f.m.flatMap((n, i) => Array.from({ length: Math.min(n, 4) }, () => i));
    const n = Math.min(10, kinds.length);
    if (n !== shown) {
      shown = n;
      fill(belt, ...Array.from({ length: n }, (_, k) => h('i', { style: { animationDelay: `${-(k * 4.2) / Math.max(1, n)}s` } }, CANDY[kinds[(k * 7) % kinds.length]])));
    }
    belt.classList.toggle('is-on', n > 0);
  };
  draw();
  answer.addEventListener('click', async () => {
    answer.disabled = true;
    await game.ask({ title: 'Answer right to earn cash' });
    answer.disabled = false;
  });
  const off = live.on(P(`me/${uid}`), (m) => { if (m && m.f) { f = { c: m.f.c || 0, r: m.f.r || 0, m: m.f.m || [] }; draw(); } });
  return () => off();
}

/* =========================================================== big screen */

export function mountScreen(el, { ref }) {
  const list = h('div', { class: 'th-board' });
  el.append(h('div', { class: 'th-screen cf-screen' }, h('h2', {}, h('img', { class: 'game-logo', src: '/assets/icon.svg', alt: '' }), '🍭 Candy Factory 🍫'), list));
  const timer = setInterval(() => {
    const top = ref.ranked().slice(0, 8);
    const max = Math.max(1, ...top.map((p) => p.score));
    fill(list, ...top.map((p, i) => h('div', { class: 'th-bar' },
      h('b', {}, String(i + 1)), blook(p.blook, 40), h('span', { class: 'grow' }, p.name),
      h('div', { class: 'th-bar-track' }, h('i', { style: { width: `${(p.score / max) * 100}%` } })),
      h('b', { class: 'th-gold' }, `${p.score} candy`))));
  }, 500);
  return () => clearInterval(timer);
}
