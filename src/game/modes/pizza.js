// pizza.js — Pizza Party: answer right for ingredients, then make the pizzas
// your hungry customers ask for before they run out of patience. Serve fast
// for a tip, serve in a row for a combo. Score = money earned.
//
// The host keeps every kitchen (stock, orders, timers), so nothing can be
// faked from a player's phone: a player only says "serve customer 2".

import { h, fill } from '../../ui/dom.js';
import { blook, preloadBlooks } from '../../ui/blooks.js';
import { sfx } from '../sound.js';

// [name, picture]
export const INGREDIENTS = [
  ['Tomato sauce', '\u{1F345}'], ['Cheese', '\u{1F9C0}'], ['Mushroom', '\u{1F344}'], ['Pepper', '\u{1FAD1}'],
  ['Pineapple', '\u{1F34D}'], ['Chilli', '\u{1F336}️'], ['Olive', '\u{1FAD2}'],
];
const CUSTOMERS = ['fox', 'unicorn', 'panda', 'robot', 'owl', 'dragon', 'cupcake', 'astronaut', 'cat', 'dog'];
const SLOTS = 3;
const PER_ANSWER = 3;

/** How long a customer waits: shorter as you get better (45 s down to 26 s). */
export const patienceFor = (served) => Math.max(26000, 45000 - served * 1500);

/** A new order: sauce and cheese, plus toppings (more as the game goes on). */
export function makeOrder(served, now, rnd = Math.random) {
  const extra = served < 2 ? 1 : served < 6 ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 2);
  const tops = [2, 3, 4, 5, 6].sort(() => rnd() - 0.5).slice(0, extra);
  return { need: [0, 1, ...tops], at: now, until: now + patienceFor(served), who: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)] };
}

/** Money for one pizza: bigger pizzas pay more, fast service tips, combos add up. */
export function payFor(order, now, combo) {
  const base = 30 + order.need.length * 12;
  const left = (order.until - now) / (order.until - order.at);
  const tip = left > 0.6 ? 25 : left > 0.3 ? 10 : 0;
  return { base, tip, combo: Math.min(50, combo * 10), total: base + tip + Math.min(50, combo * 10) };
}

/* ================================================================== host */

export function createHost({ players, dirty }) {
  const send = (p, ev) => {
    const e = p.extra;
    p.meExtra = { ...(p.meExtra || {}), z: { s: e.stock.slice(), o: e.orders.map((o) => ({ n: o.need, a: o.at, u: o.until, w: o.who })), v: e.served, c: e.combo, ...(ev ? { ev: { ...ev, n: ++e.seq } } : { ev: e.lastEv || null }) } };
    if (ev) e.lastEv = p.meExtra.z.ev;
    dirty.add(p.uid);
  };
  const summary = (p) => { p.extra.summary = `${p.extra.served} pizza${p.extra.served === 1 ? '' : 's'} served`; };
  let now = Date.now();
  return {
    join(p) {
      if (p.extra.stock) return;
      Object.assign(p.extra, { stock: INGREDIENTS.map(() => 0), orders: [], served: 0, combo: 0, seq: 0, lastEv: null });
      for (let i = 0; i < SLOTS; i++) p.extra.orders.push(makeOrder(0, now + i * 4000));
      summary(p);
      send(p);
    },
    grant(p, ok) {
      if (!ok) return 0;
      const e = p.extra;
      // what is still missing for the easiest order comes first, then the rest
      const missing = [];
      for (const o of [...e.orders].sort((a, b) => a.need.length - b.need.length)) {
        const have = e.stock.slice();
        for (const i of o.need) { if (have[i] > 0) have[i] -= 1; else missing.push(i); }
      }
      for (let k = 0; k < PER_ANSWER; k++) {
        const i = missing.length && Math.random() < 0.8 ? missing.shift() : Math.floor(Math.random() * INGREDIENTS.length);
        e.stock[i] = Math.min(9, e.stock[i] + 1);
      }
      send(p);
      return PER_ANSWER;
    },
    act(p, a) {
      const e = p.extra;
      const slot = Number(a.a);
      if (a.k !== 's' || !Number.isInteger(slot) || !e.orders[slot]) return;
      const o = e.orders[slot];
      const need = INGREDIENTS.map(() => 0);
      for (const i of o.need) need[i] += 1;
      if (need.some((n, i) => e.stock[i] < n)) return;
      need.forEach((n, i) => { e.stock[i] -= n; });
      const pay = payFor(o, now, e.combo);
      e.combo += 1;
      e.served += 1;
      p.score += pay.total;
      e.orders[slot] = makeOrder(e.served, now + 1500);
      summary(p);
      send(p, { k: 'served', slot, ...pay });
    },
    tick(t) {
      now = t;
      for (const p of players.values()) {
        const e = p.extra;
        if (!e.orders) continue;
        let left = false;
        e.orders.forEach((o, slot) => {
          if (t > o.until) { e.orders[slot] = makeOrder(e.served, t + 1500); e.combo = 0; left = slot; }
        });
        if (left !== false) send(p, { k: 'left', slot: left });
      }
    },
  };
}

/* ================================================================ player */

export function mountPlayer(game) {
  const { stage, uid, live, P } = game;
  let z = { s: INGREDIENTS.map(() => 0), o: [], v: 0, c: 0 };
  let lastEv = 0;
  game.grantText = (g) => `+${g} ingredients`;
  preloadBlooks(CUSTOMERS);

  const servedEl = h('b', {});
  const comboEl = h('span', { class: 'pz-combo' });
  const counter = h('div', { class: 'pz-orders' });
  const pantry = h('div', { class: 'pz-pantry' });
  const answer = h('button', { class: 'cf-answer pz-answer' }, h('span', {}, '\u{1F345}'), 'Answer for ingredients');
  const oven = h('div', { class: 'pz-oven', 'aria-hidden': 'true' });
  stage.append(h('div', { class: 'pz-root' },
    h('div', { class: 'pz-top' },
      h('div', { class: 'pz-sign' }, h('span', {}, '\u{1F355}'), 'Pizza Party'),
      h('div', { class: 'pz-stat' }, h('small', {}, 'Pizzas served'), servedEl, comboEl)),
    counter, answer,
    h('div', { class: 'pz-pantry-wrap' }, h('small', {}, 'Your kitchen'), pantry),
    oven));

  const bars = [];
  const drawOrders = () => {
    bars.length = 0;
    fill(counter, ...[0, 1, 2].map((slot) => {
      const o = z.o[slot];
      if (!o) return h('div', { class: 'pz-order is-empty' });
      const need = INGREDIENTS.map(() => 0);
      for (const i of o.n) need[i] += 1;
      const ready = need.every((n, i) => (z.s[i] || 0) >= n);
      const bar = h('i');
      bars.push([bar, o]);
      const serve = h('button', { class: `pz-serve${ready ? ' is-ready' : ''}`, disabled: !ready }, ready ? 'Serve \u{1F355}' : 'Need more');
      serve.addEventListener('click', () => {
        serve.disabled = true;
        game.sendAct({ k: 's', a: slot });
        sfx('pick');
      });
      return h('div', { class: `pz-order${ready ? ' is-ready' : ''}`, 'data-slot': slot },
        h('div', { class: 'pz-who' }, blook(o.w, 58)),
        h('div', { class: 'pz-bubble' }, ...o.n.map((i, k) => {
          const enough = (z.s[i] || 0) >= o.n.slice(0, k + 1).filter((x) => x === i).length;
          return h('span', { class: enough ? 'is-have' : '' }, INGREDIENTS[i][1]);
        })),
        h('div', { class: 'pz-patience' }, bar),
        serve);
    }));
    tickBars();
  };
  const drawPantry = () => fill(pantry, ...INGREDIENTS.map(([name, pic], i) => h('div', { class: `pz-ing${z.s[i] ? '' : ' is-out'}`, title: name },
    h('span', {}, pic), h('b', {}, String(z.s[i] || 0)))));
  const draw = () => {
    servedEl.textContent = String(z.v || 0);
    comboEl.textContent = z.c > 1 ? `Combo ×${z.c}` : '';
    drawOrders();
    drawPantry();
  };
  // patience bars, smooth between the host's updates
  function tickBars() {
    const t = live.now();
    for (const [bar, o] of bars) {
      const left = Math.max(0, Math.min(1, (o.u - t) / (o.u - o.a)));
      bar.style.width = `${left * 100}%`;
      bar.style.background = left > 0.6 ? '#12c9a6' : left > 0.3 ? '#ffb21f' : '#ff4772';
      bar.parentElement.parentElement.classList.toggle('is-hurry', left < 0.3);
    }
  }
  const timer = setInterval(tickBars, 200);
  draw();

  answer.addEventListener('click', async () => {
    answer.disabled = true;
    await game.ask({ title: 'Answer right for 3 ingredients' });
    answer.disabled = false;
  });

  const bake = (pay) => {
    const pie = h('div', { class: 'pz-pie' }, '\u{1F355}', h('b', {}, `+$${pay.total}`), pay.tip ? h('small', {}, `Tip $${pay.tip}!`) : null);
    oven.append(pie);
    setTimeout(() => pie.remove(), 1600);
  };
  const off = live.on(P(`me/${uid}`), (m) => {
    if (!m || !m.z) return;
    z = { s: m.z.s || [], o: m.z.o || [], v: m.z.v || 0, c: m.z.c || 0 };
    const ev = m.z.ev;
    if (ev && ev.n !== lastEv) {
      lastEv = ev.n;
      if (ev.k === 'served') {
        sfx(ev.tip ? 'win' : 'coin');
        bake(ev);
        game.flash(ev.combo ? `Combo! +$${ev.total}` : ev.tip ? `Fast service! +$${ev.total}` : `+$${ev.total}`, 'is-ok');
      }
      if (ev.k === 'left') { sfx('wrong'); game.flash('A customer got tired of waiting!', 'is-bad'); }
    }
    draw();
  });
  return () => { off(); clearInterval(timer); };
}

/* =========================================================== big screen */

export function mountScreen(el, { ref }) {
  const list = h('div', { class: 'th-board' });
  el.append(h('div', { class: 'th-screen pz-screen' }, h('h2', {}, '\u{1F355} Pizza Party \u{1F355}'), list));
  const timer = setInterval(() => {
    const top = ref.ranked().slice(0, 8);
    const max = Math.max(1, ...top.map((p) => p.score));
    fill(list, ...top.map((p, i) => h('div', { class: 'th-bar' },
      h('b', {}, String(i + 1)), blook(p.blook, 40), h('span', { class: 'grow' }, p.name),
      h('div', { class: 'th-bar-track' }, h('i', { style: { width: `${(p.score / max) * 100}%` } })),
      h('b', { class: 'th-gold' }, `${(p.extra && p.extra.served) || 0} \u{1F355} · $${p.score}`))));
  }, 500);
  return () => clearInterval(timer);
}
