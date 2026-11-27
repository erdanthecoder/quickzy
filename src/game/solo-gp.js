// solo-gp.js — Grand Prix on your own: a three-lap race against five
// computer drivers, on this device, with the quiz's questions.
//
// It runs the very same race as a live game (the same host, physics, 3D
// circuit and cockpit). Instead of the internet, a tiny message bus here
// carries the updates between the race and the cockpit, and the computer
// drivers "answer" questions now and then (some are better than others).

import { h, fill } from '../ui/dom.js';
import { picture } from '../ui/picture.js';
import { icon } from '../ui/icons.js';
import { answerPad, verdict } from './answer-ui.js';
import { check } from './questions.js';
import { sfx, playMusic, stopMusic } from './sound.js';
import { confetti, celebrate } from '../ui/confetti.js';
import { blook } from '../ui/blooks.js';
import { createHost, mountPlayer, LAP, TYRES, fmtLap, lapsOf } from './modes/grandprix.js';

export const SOLO_LAPS = 3;
const LIMIT_MS = 8 * 60000;   // the race stops after eight minutes whatever happens

// the computer drivers: [name, blook, how often they get it right, seconds between answers]
const BOTS = [
  ['Turbo Fox', 'fox', 0.82, 6.5], ['Zippy Panda', 'panda', 0.7, 7], ['Rocket Owl', 'owl', 0.62, 7.5],
  ['Dash Dragon', 'dragon', 0.75, 8], ['Nitro Cat', 'cat', 0.55, 8.5],
];

/** A little message bus with the same calls the cockpit uses online. */
function bus() {
  const subs = new Map(); const values = new Map();
  return {
    now: () => Date.now(),
    on(path, cb) {
      if (!subs.has(path)) subs.set(path, new Set());
      subs.get(path).add(cb);
      if (values.has(path)) cb(values.get(path));
      return () => subs.get(path)?.delete(cb);
    },
    async set(path, val) { values.set(path, val); for (const cb of subs.get(path) || []) cb(val); },
  };
}

/**
 * Play the race. qs/key are the quiz's questions and answers.
 * Resolves { place, of, laps, best, score, log, streak } (or null if quit).
 */
export function soloGrandPrix({ root, qs, key, name = 'You', blookId = 'dog' }) {
  return new Promise((resolve) => {
    playMusic('arcade');
    const live = bus();
    const P = (x) => x;
    const players = new Map();
    const dirty = new Set();
    const host = createHost({ live, P, players, dirty });
    const add = (uid, nm, bl) => { const p = { uid, name: nm, blook: bl, score: 0, correct: 0, extra: {} }; players.set(uid, p); return p; };
    // you start in the middle of the grid, like a real qualifying
    const order = ['b0', 'b1', 'me', 'b2', 'b3', 'b4'];
    const bots = new Map(BOTS.map(([nm, bl, skill, every], i) => [`b${i}`, { skill, every, next: 4 + Math.random() * every }]));
    for (const id of order) {
      if (id === 'me') add('me', name, blookId);
      else { const [nm, bl] = BOTS[Number(id.slice(1))]; add(id, nm, bl); }
      host.join(players.get(id));
    }
    live.set('players', Object.fromEntries([...players.values()].map((p) => [p.uid, { name: p.name, blook: p.blook }])));

    // the screen: the cockpit fills it, a small bar on top
    const stage = h('div', { class: 'arcade-stage gp-solo-stage' });
    const overlay = h('div', { class: 'q-overlay', hidden: true });
    const flashEl = h('div', { class: 'flash-msg' });
    const lapEl = h('b', {}, `Lap 1 / ${SOLO_LAPS}`);
    const quit = h('button', { class: 'btn btn-sm' }, icon('close', { size: 16 }), 'Quit');
    const meterFill = h('i'); const meterText = h('span');
    const shell = h('div', { class: 'gp-solo' },
      h('div', { class: 'hud' }, h('span', { class: 'hud-cell' }, '\u{1F3CE}️ ', lapEl), h('div', { class: 'meter' }, meterFill, meterText), quit),
      h('div', { class: 'gp-solo-body' }, stage, overlay, flashEl));
    fill(root, shell);

    let asking = null;
    let streak = 0; let bestStreak = 0; let qn = 0;
    const log = [];
    const deck = () => { const a = [...Array(qs.length).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let order2 = deck();
    let flashT = 0;
    const game = {
      stage, uid: 'me', live, P,
      get asking() { return Boolean(asking); },
      now: () => Date.now(),
      setMeter(label, frac, text = '') { meterFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; meterFill.classList.toggle('is-low', frac <= 0.2); meterText.textContent = `${label} ${text}`; },
      flash(text, kind = '') { fill(flashEl, text); flashEl.className = `flash-msg is-on ${kind}`; clearTimeout(flashT); flashT = setTimeout(() => { flashEl.className = 'flash-msg'; }, 1400); },
      shake() {},
      sendAct(a) { const p = players.get('me'); host.act(p, a); push(); },
      ask({ title = 'Answer to keep going' } = {}) {
        if (asking) return asking;
        asking = new Promise((done) => {
          if (qn >= order2.length) { order2 = deck(); qn = 0; }
          const i = order2[qn++]; const q = qs[i];
          overlay.hidden = false;
          const close = () => { overlay.hidden = true; fill(overlay); asking = null; done(); };
          const pad = answerPad(q, { showText: true, compact: true, onSubmit: (choice) => {
            const r = check(q, key[i], q.type === 'fact' && choice === undefined ? 0 : choice);
            const ok = Boolean(r.correct || r.poll);
            if (r.correct) { streak += 1; bestStreak = Math.max(bestStreak, streak); } else if (!r.poll) streak = 0;
            log.push({ q, choice, ok: r.correct, poll: r.poll, display: r.display, pts: 0 });
            const g = host.grant(players.get('me'), ok);
            push();
            sfx(ok ? 'right' : 'wrong');
            if (r.correct && streak >= 3) confetti({ y: 0.5, count: 60, power: 700 });
            fill(overlay, h('div', { class: 'q-card' }, verdict({ ok: r.correct, poll: r.poll, display: r.display, streak }),
              g ? h('p', { class: 'grant' }, `+${g}s fuel · +1 ⚡ boost`) : null));
            setTimeout(close, ok ? 900 : 2200);
          } });
          fill(overlay, h('div', { class: 'q-card' }, h('p', { class: 'q-title' }, title), h('h2', { class: 'q-text-play' }, q.text), picture(q.img, { cls: 'q-pic-small' }), pad));
        });
        return asking;
      },
    };

    // send the race to the cockpit, as the internet would
    function push() {
      for (const p of players.values()) if (p.uid === 'me' && p.meExtra) live.set('me/me', p.meExtra);
    }
    const unmount = mountPlayer(game);

    const startedAt = Date.now();
    let ended = false;
    let lastBot = Date.now();
    const pump = setInterval(() => {
      if (ended) return;
      const now = Date.now();
      // the computer drivers: answer now and then, boost on the straights, pit when worn
      const dt = (now - lastBot) / 1000; lastBot = now;
      for (const [id, b] of bots) {
        const p = players.get(id); const e = p.extra;
        b.next -= dt;
        if (b.next <= 0) { b.next = b.every * (0.7 + Math.random() * 0.6) + (e.fuel > 30 ? 6 : 0); host.grant(p, Math.random() < b.skill); }
        if (e.ers > 0 && e.boost === 0 && e.v > 60 && Math.random() < 0.02) host.act(p, { k: 'b' });
        if (e.tyre < 32 && e.pit === 0 && lapsOf(e.m) < SOLO_LAPS && Math.random() < 0.05) host.act(p, { k: 'p', c: Object.keys(TYRES)[Math.floor(Math.random() * 3)] });
      }
      host.tick(now);
      push();
      const me = players.get('me').extra;
      lapEl.textContent = `Lap ${Math.min(SOLO_LAPS, me.laps + 1)} / ${SOLO_LAPS}`;
      if (me.laps >= SOLO_LAPS || now - startedAt > LIMIT_MS) end();
    }, 250);

    function standings() {
      return [...players.values()].sort((a, b) => b.extra.m - a.extra.m);
    }
    function cleanup() {
      ended = true;
      clearInterval(pump); clearTimeout(flashT);
      unmount();
      stopMusic();
    }
    function end() {
      if (ended) return;
      const table = standings();
      const place = table.findIndex((p) => p.uid === 'me') + 1;
      const me = players.get('me');
      cleanup();
      sfx(place === 1 ? 'win' : 'reveal');
      if (place <= 3) celebrate();
      // the podium, then the usual results screen
      const score = Math.max(0, Math.round(me.extra.m)) + [0, 3000, 2000, 1200, 600, 300, 100][place];
      const podium = h('div', { class: 'gp-podium' },
        h('h1', {}, place === 1 ? '\u{1F3C6} You win the Grand Prix!' : `You finished P${place}`),
        h('ol', { class: 'gp-results' }, ...table.map((p, i) => h('li', { class: p.uid === 'me' ? 'is-me' : '' },
          h('b', {}, `P${i + 1}`), blook(p.blook, 30), h('span', { class: 'grow' }, p.uid === 'me' ? `${p.name} (you)` : p.name),
          h('small', {}, `${Math.min(SOLO_LAPS, p.extra.laps)} laps${p.extra.best ? ` · best ${fmtLap(p.extra.best)}` : ''}`)))),
        h('button', { class: 'btn btn-main btn-lg', onclick: () => resolve({ place, of: table.length, laps: me.extra.laps, best: me.extra.best, score, log, streak: bestStreak }) }, 'See my results', icon('arrowRight')));
      fill(root, h('div', { class: 'page narrow' }, h('div', { class: 'card center stack', style: { justifyItems: 'center' } }, podium)));
      window.scrollTo(0, 0);
    }
    quit.addEventListener('click', () => { cleanup(); resolve(null); });
    // for the browser tests: finish the race at once
    window.__quickzyGPSolo = { finish: () => { const me = players.get('me').extra; me.m = SOLO_LAPS * LAP + 1; me.laps = SOLO_LAPS; } };
  });
}
