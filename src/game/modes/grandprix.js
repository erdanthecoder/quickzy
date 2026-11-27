// grandprix.js — Grand Prix (Pro): a motor race on a real circuit.
//
// The cars drive themselves at racing speed: flat out on the straights,
// braking hard for the corners. Your job is the strategy:
//   - Fuel: every right answer puts 10 seconds of fuel in. Run dry and the
//     car rolls to a stop.
//   - ERS (⚡): every right answer charges one boost (up to 3). Press
//     Overtake for 5 seconds of extra power. It wears the tyres faster.
//   - Tyres wear out lap by lap and the car gets slower. Box for fresh tyres
//     (5 seconds in the pits) at the right moment.
//   - Slipstream: right behind a rival you go a little faster.
// The farthest car wins (the score is metres driven).
//
// The host runs every car (nothing can be faked from a phone); players and
// the big screen run the same physics in between the host's updates.

import { makeCanvas, loop, drawBlook, nameTag, rr, lerp, hashString } from '../arcade/engine.js';
import { preloadBlooks, blook } from '../../ui/blooks.js';
import { h, fill } from '../../ui/dom.js';
import { sfx } from '../sound.js';

export const LAP = 4000;             // metres in one lap
export const FUEL_PER_ANSWER = 10;   // seconds of racing
export const START_FUEL = 14;
export const MAX_FUEL = 60;
export const MAX_ERS = 3;
export const BOOST_SECONDS = 5;
export const PIT_SECONDS = 5;
const VTOP = 92;                     // m/s (331 km/h)
const ALAT = 38;                     // grip in the corners, m/s² (almost 4 g)
const BRAKE = 42;                    // m/s²
const STEP = 4;                      // metres between track samples
const WEAR = 100 / 11000;            // tyre % per metre: a set lasts about 2.5 laps
export const TRACK_WIDTH = 14;

/* ============================================================ the circuit */

// the shape (metres), driven in this order; scaled to exactly one lap
const RAW = [[0, 0], [350, 0], [700, 0], [830, 30], [870, 140], [800, 230], [650, 260], [560, 340], [590, 460], [700, 520],
  [760, 620], [700, 700], [590, 680], [480, 600], [360, 640], [230, 720], [90, 700], [-20, 600], [-60, 460], [-150, 380],
  [-200, 260], [-160, 120], [-90, 30]];

function buildTrack() {
  const n = RAW.length;
  const dense = [];
  const cr = (a, b, c, d, t) => {
    const t2 = t * t; const t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  };
  for (let i = 0; i < n; i++) {
    const p0 = RAW[(i - 1 + n) % n]; const p1 = RAW[i]; const p2 = RAW[(i + 1) % n]; const p3 = RAW[(i + 2) % n];
    for (let k = 0; k < 60; k++) { const t = k / 60; dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  let len = 0;
  for (let i = 0; i < dense.length; i++) { const a = dense[i]; const b = dense[(i + 1) % dense.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const sc = LAP / len;
  for (const p of dense) { p[0] *= sc; p[1] *= sc; }
  // resample every STEP metres
  const N = Math.round(LAP / STEP);
  const X = new Float64Array(N); const Z = new Float64Array(N);
  let i = 0; let walked = 0;
  for (let k = 0; k < N; k++) {
    const want = k * STEP;
    for (;;) {
      const a = dense[i % dense.length]; const b = dense[(i + 1) % dense.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (walked + seg >= want || i > dense.length * 2) { const f = seg ? (want - walked) / seg : 0; X[k] = a[0] + (b[0] - a[0]) * f; Z[k] = a[1] + (b[1] - a[1]) * f; break; }
      walked += seg; i += 1;
    }
  }
  // direction, curvature and the fastest safe speed at each point
  const DX = new Float64Array(N); const DZ = new Float64Array(N); const K = new Float64Array(N); const V = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const b = (k + 1) % N; const a = (k - 1 + N) % N;
    const dx = X[b] - X[a]; const dz = Z[b] - Z[a]; const l = Math.hypot(dx, dz) || 1;
    DX[k] = dx / l; DZ[k] = dz / l;
  }
  for (let k = 0; k < N; k++) {
    const a = (k - 2 + N) % N; const b = (k + 2) % N;
    let d = Math.atan2(DZ[b], DX[b]) - Math.atan2(DZ[a], DX[a]);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    K[k] = d / (4 * STEP);
    V[k] = Math.min(VTOP, Math.sqrt(ALAT / Math.max(Math.abs(K[k]), 1e-6)));
  }
  // brake before the corners, accelerate out of them
  for (let pass = 0; pass < 2; pass++) {
    for (let k = N - 1; k >= 0; k--) { const nx = V[(k + 1) % N]; V[k] = Math.min(V[k], Math.sqrt(nx * nx + 2 * BRAKE * STEP)); }
    for (let k = 0; k < N; k++) { const pv = V[(k - 1 + N) % N]; V[k] = Math.min(V[k], Math.sqrt(pv * pv + 2 * accelAt(pv) * STEP)); }
  }
  return { N, X, Z, DX, DZ, K, V };
}
function accelAt(v) { return Math.max(4, 15 - v * 0.11); }

export const TRACK = buildTrack();
const wrap = (m) => ((m % LAP) + LAP) % LAP;

/** Where a car is: position, heading (unit vector) and the curve. Lateral
 * offset is to the left of the driving direction. */
export function trackAt(m, lateral = 0) {
  const { N, X, Z, DX, DZ, K } = TRACK;
  const f = wrap(m) / STEP; const i = Math.floor(f) % N; const j = (i + 1) % N; const t = f - Math.floor(f);
  const dx = lerp(DX[i], DX[j], t); const dz = lerp(DZ[i], DZ[j], t); const l = Math.hypot(dx, dz) || 1;
  const hx = dx / l; const hz = dz / l;
  return { x: lerp(X[i], X[j], t) - hz * lateral, z: lerp(Z[i], Z[j], t) + hx * lateral, hx, hz, k: lerp(K[i], K[j], t) };
}
/** The racing speed at this point of the lap (m/s). */
export function profileAt(m) {
  const { N, V } = TRACK;
  const f = wrap(m) / STEP; const i = Math.floor(f) % N; const t = f - Math.floor(f);
  return lerp(V[i], V[(i + 1) % N], t);
}

/** One step of a car's physics (the same on the host and on screens). */
export function step(e, dt, slip = false) {
  if (e.pit > 0) {
    e.pit = Math.max(0, e.pit - dt);
    e.v = Math.max(0, e.v - 30 * dt);
    if (e.pit === 0) e.tyre = 100;
    return;
  }
  const boosting = e.boost > 0;
  if (boosting) e.boost = Math.max(0, e.boost - dt);
  let target = 0;
  if (e.fuel > 0) {
    target = profileAt(e.m + e.v * 0.15) * (0.82 + 0.18 * e.tyre / 100) * (boosting ? 1.12 : 1) * (slip ? 1.04 : 1);
    e.fuel = Math.max(0, e.fuel - dt);
  }
  if (e.v < target) e.v = Math.min(target, e.v + accelAt(e.v) * (boosting ? 1.4 : 1) * dt);
  else e.v = Math.max(target, e.v - (target === 0 ? 7 : BRAKE) * dt);
  const ds = e.v * dt;
  e.m += ds;
  e.tyre = Math.max(0, e.tyre - ds * WEAR * (boosting ? 1.8 : 1));
}

/** Is there a car 4–45 m ahead (to draft behind)? */
export const slipFor = (m, others) => others.some((o) => o - m > 4 && o - m < 45);

export const kmh = (v) => Math.round(v * 3.6);
export const gear = (v) => (v < 1 ? 'N' : String(Math.min(8, 1 + Math.floor(v / 12.5))));
export const fmtLap = (ms) => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
export const lapsOf = (m) => Math.max(0, Math.floor(m / LAP));
const metres = (m) => `${Math.max(0, Math.round(m)).toLocaleString()} m`;

// team colours, picked from the player's id
export const LIVERY = ['#e10600', '#1e41ff', '#00a19c', '#ff8000', '#2b2d42', '#006f62', '#f2f2f2', '#ffd400', '#9b59ff', '#ff4fa3'];
export const liveryOf = (uid) => LIVERY[hashString(uid) % LIVERY.length];
export const laneOf = (uid) => [-4, -1.5, 1, 3.5, -2.8, 2.3][hashString(`${uid}lane`) % 6];

/* ================================================================== host */

export function createHost({ live, P, players, dirty }) {
  let slot = 0;
  let last = 0;
  const send = (p, ev) => {
    const e = p.extra;
    const r = (x, n = 10) => Math.round(x * n) / n;
    p.meExtra = { ...(p.meExtra || {}), gp: {
      f: r(e.fuel), t: r(e.tyre), e: e.ers, b: r(e.boost), p: r(e.pit), v: r(e.v), m: r(e.m), l: e.laps, bt: e.best || 0,
      ...(ev ? { ev: { ...ev, n: ++e.seq } } : { ev: e.lastEv || null }) } };
    if (ev) e.lastEv = p.meExtra.gp.ev;
    dirty.add(p.uid);
  };
  return {
    // the score is the distance, nothing else
    answerPoints: false,
    join(p) {
      if (p.extra.m !== undefined) return;
      // a starting grid: two by two, eight metres apart
      const m = -8 * Math.floor(slot / 2) - 4 * (slot % 2);
      slot += 1;
      Object.assign(p.extra, { m, v: 0, fuel: START_FUEL, tyre: 100, ers: 1, boost: 0, pit: 0, laps: 0, lapAt: 0, best: 0, seq: 0, lastEv: null, summary: 'On the grid' });
      send(p);
    },
    grant(p, ok) {
      if (!ok) return 0;
      const e = p.extra;
      e.fuel = Math.min(MAX_FUEL, e.fuel + FUEL_PER_ANSWER);
      e.ers = Math.min(MAX_ERS, e.ers + 1);
      send(p);
      return FUEL_PER_ANSWER;
    },
    act(p, a) {
      const e = p.extra;
      if (a.k === 'b' && e.ers > 0 && e.boost === 0 && e.pit === 0 && e.fuel > 0) {
        e.ers -= 1; e.boost = BOOST_SECONDS;
        send(p, { k: 'boost' });
      }
      // (phones ask at under 95%; a little leeway for the second between updates)
      if (a.k === 'p' && e.pit === 0 && e.tyre < 98) {
        e.pit = PIT_SECONDS;
        send(p, { k: 'pit' });
      }
    },
    tick(now) {
      const secs = last ? Math.min(3, (now - last) / 1000) : 0;
      last = now;
      const all = [...players.values()].filter((p) => p.extra.m !== undefined);
      const spots = all.map((p) => p.extra.m);
      const race = {};
      for (const p of all) {
        const e = p.extra;
        if (!e.lapAt) e.lapAt = now;
        const slip = slipFor(e.m, spots);
        // small steps, so the corners are taken properly
        for (let left = secs; left > 1e-6; left -= 0.05) step(e, Math.min(0.05, left), slip);
        let ev = null;
        const laps = lapsOf(e.m);
        if (laps > e.laps) {
          const time = now - e.lapAt;
          e.laps = laps; e.lapAt = now;
          const best = !e.best || time < e.best;
          if (best) e.best = time;
          ev = { k: 'lap', l: laps, t: time, best };
        }
        const score = Math.max(0, Math.floor(e.m));
        p.score = score;
        e.summary = e.laps ? `${e.laps} lap${e.laps === 1 ? '' : 's'}${e.best ? ` · best ${fmtLap(e.best)}` : ''}` : metres(e.m);
        send(p, ev);
        race[p.uid] = [Math.round(e.m), Math.round(e.v * 10) / 10, e.pit > 0 ? 1 : 0];
      }
      live.set(P('race'), race).catch(() => {});
    },
  };
}

/* ======================================================== the cockpit HUD */

function cockpit(game) {
  const pos = h('b', {}, '–'); const lapEl = h('b', {}, '1'); const bestEl = h('small', {});
  const speed = h('b', { class: 'gp-speed' }, '0'); const gearEl = h('i', { class: 'gp-gear' }, 'N');
  const fuelBar = h('i'); const fuelTxt = h('small', {});
  const tyreBar = h('i'); const tyreTxt = h('small', {});
  const ersEl = h('div', { class: 'gp-ers' });
  const answer = h('button', { class: 'gp-btn gp-fuel', type: 'button' }, h('span', {}, '⛽'), h('b', {}, 'Answer for fuel'), h('small', {}, `+${FUEL_PER_ANSWER}s fuel · +1 ⚡`));
  const boost = h('button', { class: 'gp-btn gp-boost', type: 'button', disabled: true }, h('span', {}, '⚡'), h('b', {}, 'Overtake'));
  const pit = h('button', { class: 'gp-btn gp-pit', type: 'button', disabled: true }, h('span', {}, '\u{1F527}'), h('b', {}, 'Pit stop'));
  const radio = h('div', { class: 'gp-radio', hidden: true });
  const ahead = h('div', { class: 'gp-gap is-ahead', hidden: true }); const behind = h('div', { class: 'gp-gap is-behind', hidden: true });
  const lights = h('div', { class: 'gp-lights', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => h('i')));
  const el = h('div', { class: 'gp-hud' },
    h('div', { class: 'gp-tower' }, h('div', {}, h('small', {}, 'POS'), pos), h('div', {}, h('small', {}, 'LAP'), lapEl), bestEl),
    h('div', { class: 'gp-gaps' }, ahead, behind),
    radio, lights,
    h('div', { class: 'gp-dash' },
      h('div', { class: 'gp-speedo' }, speed, h('small', {}, 'KM/H'), gearEl),
      h('div', { class: 'gp-gauges' },
        h('div', { class: 'gp-bar is-fuel' }, h('small', {}, 'FUEL'), h('div', {}, fuelBar), fuelTxt),
        h('div', { class: 'gp-bar is-tyre' }, h('small', {}, 'TYRES'), h('div', {}, tyreBar), tyreTxt),
        ersEl)),
    h('div', { class: 'gp-btns' }, answer, boost, pit));
  return { el, pos, lapEl, bestEl, speed, gearEl, fuelBar, fuelTxt, tyreBar, tyreTxt, ersEl, answer, boost, pit, radio, ahead, behind, lights };
}

/**
 * The player's side, shared by the 2D and 3D views: the car's state from the
 * host (run between updates with the same physics), the rivals, the HUD and
 * the buttons. `draw(car, rivals, t)` paints the view.
 */
function mountDriver(game, holder, draw) {
  const { uid, live, P } = game;
  const hud = cockpit(game);
  holder.append(hud.el);
  game.grantText = (g) => `+${g}s fuel · +1 ⚡ boost`;
  const names = new Map();
  let race = {};
  const car = { m: 0, v: 0, fuel: START_FUEL, tyre: 100, ers: 1, boost: 0, pit: 0, laps: 0, best: 0 };
  let serverM = null;
  let lastEv = 0;
  let t = 0;
  let radioUntil = 0;
  let warnFuel = 0; let warnTyre = 0;
  const lastSide = new Map();
  const shownRivals = new Map();
  const unsubs = [];

  const say = (text, kind = '') => { fill(hud.radio, h('small', {}, 'TEAM RADIO'), h('b', {}, text)); hud.radio.className = `gp-radio ${kind}`; hud.radio.hidden = false; radioUntil = t + 3.2; };

  unsubs.push(live.on(P('players'), (val) => { for (const [u, p] of Object.entries(val || {})) names.set(u, p); preloadBlooks([...names.values()].map((p) => p.blook)); }));
  unsubs.push(live.on(P(`me/${uid}`), (m) => {
    const g = m && m.gp;
    if (!g) return;
    Object.assign(car, { fuel: g.f, tyre: g.t, ers: g.e, boost: g.b, pit: g.p, laps: g.l, best: g.bt });
    if (serverM === null) { car.m = g.m; car.v = g.v; }
    serverM = g.m;
    if (Math.abs(g.m - car.m) > 150) { car.m = g.m; car.v = g.v; }
    const ev = g.ev;
    if (ev && ev.n !== lastEv) {
      const first = lastEv === 0 && ev.n > 1;
      lastEv = ev.n;
      if (!first) {
        if (ev.k === 'lap') { sfx(ev.best ? 'checkpoint' : 'coin'); say(ev.best ? `Lap ${ev.l}: ${fmtLap(ev.t)}. Fastest lap, mega!` : `Lap ${ev.l}: ${fmtLap(ev.t)}`, ev.best ? 'is-purple' : ''); }
        if (ev.k === 'boost') { sfx('boost'); game.flash('⚡ Overtake mode!', 'is-ok'); }
        if (ev.k === 'pit') { sfx('pick'); say('Box, box! New tyres coming…'); }
      }
    }
  }));
  unsubs.push(live.on(P('race'), (r) => {
    race = r || {};
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      const side = Math.sign(d[0] - car.m); const was = lastSide.get(u); const who = names.get(u)?.name || 'Someone';
      if (was === -1 && side === 1) game.flash(`${who} passed you!`, 'is-bad');
      if (was === 1 && side === -1) { game.flash(`You passed ${who}!`, 'is-ok'); sfx('coin'); }
      if (side) lastSide.set(u, side);
    }
  }));

  const getFuel = async () => { if (!game.asking) await game.ask({ title: `Answer right for ${FUEL_PER_ANSWER}s of fuel and a boost` }); };
  const doBoost = () => { if (car.ers > 0 && car.boost === 0 && car.pit === 0 && car.fuel > 0 && !game.asking) { game.sendAct({ k: 'b' }); hud.boost.disabled = true; } };
  const doPit = () => { if (car.pit === 0 && car.tyre < 95 && !game.asking) { game.sendAct({ k: 'p' }); hud.pit.disabled = true; } };
  hud.answer.addEventListener('click', getFuel);
  hud.boost.addEventListener('click', doBoost);
  hud.pit.addEventListener('click', doPit);
  const keys = (e) => {
    if (e.target && /INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) && e.code !== 'KeyF') return;
    if (game.asking) return;
    if (e.code === 'KeyF' || e.code === 'Enter') { e.preventDefault(); getFuel(); }
    if (e.code === 'Space' || e.code === 'KeyB') { e.preventDefault(); doBoost(); }
    if (e.code === 'KeyP') doPit();
  };
  window.addEventListener('keydown', keys);
  // for the browser tests
  window.__quickzyGP = { state: () => ({ ...car }) };

  let shown = '';
  let shownRivalList = [];
  let lastFrame = performance.now();
  const stop = loop((dt) => {
    t += dt;
    const others = Object.entries(race).filter(([u]) => u !== uid).map(([, d]) => d[0]);
    step(car, dt, slipFor(car.m, others));
    if (serverM !== null) { car.m += (serverM - car.m) * Math.min(1, dt * 0.8); serverM += car.v * dt; }
    // rivals: run them forward from their last report
    const rivals = [];
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      const s = shownRivals.get(u) || { m: d[0], v: d[1], at: d };
      if (s.at !== d) { s.target = d[0]; s.at = d; s.v = d[1]; }
      s.m += s.v * dt;
      if (s.target !== undefined) { s.m += (s.target + s.v * 0.5 - s.m) * Math.min(1, dt * 0.9); s.target += s.v * dt; }
      shownRivals.set(u, s);
      const info = names.get(u) || {};
      rivals.push({ uid: u, m: s.m, v: s.v, pit: d[2], name: info.name || '', blook: info.blook });
    }
    for (const u of [...shownRivals.keys()]) if (!race[u]) shownRivals.delete(u);
    // warnings on the radio
    if (car.fuel <= 0 && car.pit === 0 && t > warnFuel) { warnFuel = t + 6; say('We are out of fuel! Answer a question!', 'is-bad'); sfx('wrong'); }
    else if (car.fuel > 0 && car.fuel < 4 && t > warnFuel) { warnFuel = t + 8; say('Fuel is low, answer for more', 'is-warn'); }
    if (car.tyre < 30 && car.pit === 0 && t > warnTyre) { warnTyre = t + 12; say('Tyres are gone. Box, box!', 'is-warn'); }
    if (t > radioUntil) hud.radio.hidden = true;
    shownRivalList = rivals;
  }, () => {
    const nowMs = performance.now(); const dt = Math.min(0.1, (nowMs - lastFrame) / 1000); lastFrame = nowMs;
    const rivals = shownRivalList;
    game.setMeter('Fuel', car.fuel / MAX_FUEL, `${Math.ceil(car.fuel)}s`);
    draw({ ...car, uid, lane: laneOf(uid) }, rivals, t, dt);
    // the dashboard (only what changed)
    const ranked = [car.m, ...rivals.map((r) => r.m)].sort((a, b) => b - a);
    const position = ranked.indexOf(car.m) + 1;
    const txt = [kmh(car.v), gear(car.v), Math.ceil(car.fuel), Math.round(car.tyre), car.ers, car.boost > 0, car.pit > 0, position, ranked.length, car.laps, car.best, game.asking].join('|');
    if (txt !== shown) {
      shown = txt;
      hud.speed.textContent = String(kmh(car.v));
      hud.gearEl.textContent = gear(car.v);
      hud.pos.textContent = `P${position}`;
      hud.lapEl.textContent = String(car.laps + 1);
      hud.bestEl.textContent = car.best ? `Best ${fmtLap(car.best)}` : '';
      hud.fuelBar.style.width = `${(car.fuel / MAX_FUEL) * 100}%`;
      hud.fuelBar.parentElement.parentElement.classList.toggle('is-low', car.fuel < 5);
      hud.fuelTxt.textContent = `${Math.ceil(car.fuel)}s`;
      hud.tyreBar.style.width = `${car.tyre}%`;
      hud.tyreBar.style.background = car.tyre > 60 ? '#19c37d' : car.tyre > 30 ? '#ffcd1f' : '#ff4772';
      hud.tyreTxt.textContent = `${Math.round(car.tyre)}%`;
      fill(hud.ersEl, h('small', {}, 'ERS'), ...Array.from({ length: MAX_ERS }, (_, i) => h('i', { class: i < car.ers ? 'is-on' : '' }, '⚡')));
      hud.boost.disabled = !(car.ers > 0 && car.boost === 0 && car.pit === 0 && car.fuel > 0) || game.asking;
      hud.boost.classList.toggle('is-on', car.boost > 0);
      hud.pit.disabled = !(car.pit === 0 && car.tyre < 95) || game.asking;
      hud.pit.classList.toggle('is-on', car.pit > 0);
      hud.pit.classList.toggle('is-urgent', car.tyre < 30 && car.pit === 0);
      hud.answer.classList.toggle('is-urgent', car.fuel < 4);
      hud.answer.disabled = game.asking;
      hud.el.classList.toggle('is-boost', car.boost > 0);
    }
    let a = null; let b = null;
    for (const r of rivals) {
      if (r.m > car.m && (!a || r.m < a.m)) a = r;
      if (r.m <= car.m && (!b || r.m > b.m)) b = r;
    }
    const gap = (d, v) => `${(Math.abs(d) / Math.max(20, v)).toFixed(1)}s`;
    hud.ahead.hidden = !a; hud.behind.hidden = !b;
    if (a) hud.ahead.textContent = `▲ ${a.name} +${gap(a.m - car.m, car.v)}`;
    if (b) hud.behind.textContent = `▼ ${b.name} -${gap(car.m - b.m, b.v)}`;
    hud.lights.classList.toggle('is-out', t > 2.6);
    hud.lights.style.setProperty('--on', String(Math.min(5, Math.floor(t * 2.2))));
  });
  return () => { stop(); unsubs.forEach((u) => u()); window.removeEventListener('keydown', keys); delete window.__quickzyGP; hud.el.remove(); };
}

/* =============================================== 2D views (no 3D, or tests) */

const minX = Math.min(...TRACK.X); const maxX = Math.max(...TRACK.X);
const minZ = Math.min(...TRACK.Z); const maxZ = Math.max(...TRACK.Z);

function trackPath(ctx, tx, tz, every = 2) {
  ctx.beginPath();
  for (let k = 0; k <= TRACK.N; k += every) { const i = k % TRACK.N; const x = tx(TRACK.X[i], TRACK.Z[i]); const y = tz(TRACK.X[i], TRACK.Z[i]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
}

function drawCar2D(ctx, x, y, ang, colour, scale) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(ctx, -9, -26, 20, 54, 6); ctx.fill();
  ctx.fillStyle = '#111';
  for (const [wx, wy] of [[-11, -18], [7, -18], [-11, 12], [7, 12]]) { rr(ctx, wx, wy, 5, 10, 2); ctx.fill(); }
  ctx.fillStyle = colour; rr(ctx, -5, -26, 10, 50, 4); ctx.fill();
  rr(ctx, -12, -28, 24, 5, 2); ctx.fill(); rr(ctx, -11, 21, 22, 6, 2); ctx.fill();
  ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(0, 2, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function mountPlayer2D(game) {
  const holder = h('div', { class: 'gp-root is-2d' });
  game.stage.append(holder);
  const view = makeCanvas(holder);
  const { ctx } = view;
  const kerb = (k) => Math.abs(k) > 0.008;
  const off = mountDriver(game, holder, (car, rivals, t) => {
    view.begin();
    const w = view.w; const hh = view.h;
    const sc = Math.max(3, Math.min(w, hh) / 75);
    const me = trackAt(car.m, car.lane);
    const heading = Math.atan2(me.hz, me.hx);
    // the camera: above the car, looking ahead, the road pointing up
    ctx.fillStyle = '#3f8f3a'; ctx.fillRect(0, 0, w, hh);
    ctx.save();
    ctx.translate(w / 2, hh * 0.68);
    ctx.rotate(-Math.PI / 2 - heading);
    ctx.scale(sc, sc);
    ctx.translate(-me.x, -me.z);
    // mown grass stripes
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let gx = Math.floor((me.x - 300) / 24) * 24; gx < me.x + 300; gx += 48) ctx.fillRect(gx, me.z - 300, 24, 600);
    const tx = (x) => x; const tz = (x, z) => z;
    // run-off, kerbs, asphalt, lines
    ctx.lineJoin = 'round';
    trackPath(ctx, tx, tz); ctx.strokeStyle = '#c9c4b8'; ctx.lineWidth = TRACK_WIDTH + 12; ctx.stroke();
    ctx.strokeStyle = '#4b4d52'; ctx.lineWidth = TRACK_WIDTH; ctx.stroke();
    ctx.setLineDash([1.5, 6]); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.35; ctx.stroke(); ctx.setLineDash([]);
    // kerbs in the corners
    for (let i = 0; i < TRACK.N; i++) {
      if (!kerb(TRACK.K[i])) continue;
      const side = Math.sign(TRACK.K[i]);
      for (const s of [side, -side]) {
        const ox = -TRACK.DZ[i] * (TRACK_WIDTH / 2 + 0.8) * s; const oz = TRACK.DX[i] * (TRACK_WIDTH / 2 + 0.8) * s;
        ctx.strokeStyle = i % 2 ? '#e10600' : '#fff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(TRACK.X[i] + ox, TRACK.Z[i] + oz); ctx.lineTo(TRACK.X[(i + 1) % TRACK.N] + ox, TRACK.Z[(i + 1) % TRACK.N] + oz); ctx.stroke();
      }
    }
    // the start line, chequered
    const s0 = trackAt(0);
    for (let a = 0; a < 7; a++) for (let b = 0; b < 2; b++) {
      ctx.fillStyle = (a + b) % 2 ? '#fff' : '#111';
      const l = -TRACK_WIDTH / 2 + a * 2;
      ctx.fillRect(s0.x - s0.hz * l + s0.hx * b * 2 - 1, s0.z + s0.hx * l + s0.hz * b * 2 - 1, 2, 2);
    }
    // the cars
    const near = rivals.filter((r) => Math.abs(r.m - car.m) < 260 || Math.abs(r.m - car.m - LAP) < 260 || Math.abs(r.m - car.m + LAP) < 260);
    for (const r of near) {
      const p = trackAt(r.m, laneOf(r.uid));
      drawCar2D(ctx, p.x, p.z, Math.atan2(p.hz, p.hx) + Math.PI / 2, liveryOf(r.uid), 0.14);
    }
    drawCar2D(ctx, me.x, me.z, heading + Math.PI / 2, liveryOf(car.uid), 0.14);
    ctx.restore();
    // names over the rivals (upright)
    for (const r of near) {
      const p = trackAt(r.m, laneOf(r.uid));
      const dx = p.x - me.x; const dz = p.z - me.z; const a = -Math.PI / 2 - heading;
      const sx = w / 2 + (dx * Math.cos(a) - dz * Math.sin(a)) * sc; const sy = hh * 0.68 + (dx * Math.sin(a) + dz * Math.cos(a)) * sc;
      nameTag(ctx, r.name, sx, sy - 26, { bg: 'rgba(23,19,63,.8)', size: 12 });
    }
    // boost: speed streaks
    if (car.boost > 0) {
      ctx.strokeStyle = 'rgba(120,220,255,.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const x = (i * 97 + t * 900) % w; ctx.beginPath(); ctx.moveTo(x, (i * 53 + t * 1400) % hh); ctx.lineTo(x, (i * 53 + t * 1400) % hh + 50); ctx.stroke(); }
    }
    // the mini map
    const mw = Math.min(150, w * 0.32); const mh = mw * ((maxZ - minZ) / (maxX - minX));
    const mx = w - mw - 12; const my = 64;
    ctx.fillStyle = 'rgba(15,12,40,.55)'; rr(ctx, mx - 8, my - 8, mw + 16, mh + 16, 10); ctx.fill();
    const mapX = (x) => mx + ((x - minX) / (maxX - minX)) * mw; const mapZ = (x, z) => my + ((z - minZ) / (maxZ - minZ)) * mh;
    trackPath(ctx, mapX, mapZ, 6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    for (const r of rivals) { const p = trackAt(r.m); ctx.fillStyle = liveryOf(r.uid); ctx.beginPath(); ctx.arc(mapX(p.x), mapZ(p.x, p.z), 3.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#17133f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mapX(me.x), mapZ(me.x, me.z), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  return () => { off(); view.destroy(); holder.remove(); };
}

function timingTower(list, title = 'Grand Prix') {
  const lead = list[0];
  return [h('h3', {}, h('span', { class: 'gp-flag' }, '\u{1F3C1}'), title),
    ...list.map((p, i) => {
      const m = p.extra.m ?? p.score;
      const laps = lapsOf(m);
      const gapM = lead ? (lead.extra.m ?? lead.score) - m : 0;
      const gapTxt = i === 0 ? `Lap ${laps + 1}` : gapM > LAP ? `+${Math.floor(gapM / LAP)} lap${gapM >= 2 * LAP ? 's' : ''}` : `+${(gapM / 70).toFixed(1)}s`;
      return h('div', { class: `gp-row${i === 0 ? ' is-first' : ''}` },
        h('b', {}, String(i + 1)), h('i', { class: 'gp-team', style: { background: liveryOf(p.uid) } }),
        blook(p.blook, 26), h('span', { class: 'grow' }, p.name),
        p.extra.pit > 0 ? h('em', { class: 'gp-in-pit' }, 'PIT') : null,
        h('small', {}, gapTxt));
    })];
}

function mountScreen2D(el, { ref }) {
  const holder = h('div', { class: 'gp-root gp-screen is-2d' });
  const tower = h('div', { class: 'gp-timing' });
  el.append(holder);
  const view = makeCanvas(holder);
  const { ctx } = view;
  holder.append(tower);
  const shown = new Map();
  let towerText = '';
  let last = performance.now();
  const stop = loop(() => {}, () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    view.begin();
    const w = view.w; const hh = view.h;
    ctx.fillStyle = '#2f7a33'; ctx.fillRect(0, 0, w, hh);
    const pad = 60; const tw = w - pad * 2 - Math.min(320, w * 0.3);
    const sc = Math.min(tw / (maxX - minX), (hh - pad * 2) / (maxZ - minZ));
    const ox = pad; const oz = (hh - (maxZ - minZ) * sc) / 2;
    const tx = (x) => ox + (x - minX) * sc; const tz = (x, z) => oz + (z - minZ) * sc;
    ctx.lineJoin = 'round';
    trackPath(ctx, tx, tz); ctx.strokeStyle = '#c9c4b8'; ctx.lineWidth = Math.max(10, (TRACK_WIDTH + 14) * sc); ctx.stroke();
    ctx.strokeStyle = '#45474d'; ctx.lineWidth = Math.max(7, TRACK_WIDTH * sc); ctx.stroke();
    const s0 = trackAt(0);
    ctx.fillStyle = '#fff'; ctx.fillRect(tx(s0.x) - 2, tz(s0.x, s0.z) - 10, 4, 20);
    const list = ref.ranked();
    list.forEach((p, i) => {
      const m = p.extra.m ?? p.score;
      const sm = lerp(shown.get(p.uid) ?? m, m + (p.extra.v || 0) * 0.5, Math.min(1, dt * 1.5)); shown.set(p.uid, sm);
      const q = trackAt(sm, laneOf(p.uid));
      const x = tx(q.x); const y = tz(q.x, q.z);
      ctx.fillStyle = liveryOf(p.uid); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, i < 3 ? 11 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (i < 5) { drawBlook(ctx, p.blook, x, y - 26, 26); nameTag(ctx, `${i + 1}. ${p.name}`, x, y - 50, { bg: i === 0 ? '#ffcd1f' : 'rgba(23,19,63,.85)', fg: i === 0 ? '#17133f' : '#fff', size: 12 }); }
    });
    const tt = list.slice(0, 10).map((p) => `${p.uid}${Math.floor((p.extra.m ?? p.score) / 50)}${p.extra.pit > 0}`).join('|');
    if (tt !== towerText) { towerText = tt; fill(tower, ...timingTower(list.slice(0, 10))); }
  });
  return () => { stop(); view.destroy(); holder.remove(); };
}

/* ============================================================ 3D views */

// The 3D circuit needs three.js from the web; without it (or without WebGL)
// the 2D views take over.
const load3D = () => Promise.all([import('./gp3d.js'), import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js')]);
const want3D = () => !navigator.webdriver || (() => { try { return localStorage.getItem('quickzy.test.3d') === '1'; } catch { return false; } })();

export function mountPlayer(game) {
  if (!want3D()) return mountPlayer2D(game);
  let cleanup = null; let gone = false;
  const holder = h('div', { class: 'gp-root is-3d' }, h('div', { class: 'gp-loading' }, h('span', {}, '\u{1F3CE}️'), 'Warming up the tyres…'));
  game.stage.append(holder);
  load3D().then(([W, T]) => {
    if (gone) return;
    try { cleanup = mountPlayer3D(game, holder, W, T); } catch (err) { console.warn(err); holder.remove(); cleanup = mountPlayer2D(game); }
  }).catch(() => { if (!gone) { holder.remove(); cleanup = mountPlayer2D(game); } });
  return () => { gone = true; if (cleanup) cleanup(); holder.remove(); };
}

export function mountScreen(el, opts) {
  if (!want3D()) return mountScreen2D(el, opts);
  let cleanup = null; let gone = false;
  const holder = h('div', { class: 'gp-root gp-screen is-3d' });
  el.append(holder);
  load3D().then(([W, T]) => {
    if (gone) return;
    try { cleanup = mountScreen3D(holder, opts, W, T); } catch (err) { console.warn(err); holder.remove(); cleanup = mountScreen2D(el, opts); }
  }).catch(() => { if (!gone) { holder.remove(); cleanup = mountScreen2D(el, opts); } });
  return () => { gone = true; if (cleanup) cleanup(); holder.remove(); };
}

function mountPlayer3D(game, holder, W, T) {
  const canvas = h('canvas', { class: 'gp-canvas' });
  const camBtn = h('button', { class: 'gp-cam', type: 'button' }, '\u{1F3A5} Camera');
  fill(holder, canvas, camBtn);
  const world = W.createCircuit(T, canvas, {});
  const views = ['chase', 'tcam', 'far'];
  let view = 0;
  const toggle = () => { view = (view + 1) % views.length; };
  camBtn.addEventListener('click', toggle);
  const keys = (e) => { if (e.code === 'KeyV' || e.code === 'KeyC') toggle(); };
  window.addEventListener('keydown', keys);
  const off = mountDriver(game, holder, (car, rivals, t, dt) => {
    const ids = new Set(rivals.map((r) => r.uid));
    for (const id of [...world.cars.keys()]) if (id !== car.uid && !ids.has(id)) world.removeCar(id);
    const mine = world.carFor(car.uid, liveryOf(car.uid), '');
    world.placeCar(mine, car.m, car.lane, car.v, dt, { boost: car.boost > 0 });
    for (const r of rivals) {
      const c = world.carFor(r.uid, liveryOf(r.uid), r.name);
      const near = Math.abs(((r.m - car.m) % LAP + LAP + LAP / 2) % LAP - LAP / 2) < 600;
      c.g.visible = near;
      if (near) world.placeCar(c, r.m, laneOf(r.uid), r.v, dt, {});
    }
    world.camera(views[view], mine, car.v, t, dt);
    world.render(dt, mine.g.position);
  });
  return () => { off(); world.destroy(); window.removeEventListener('keydown', keys); };
}

function mountScreen3D(holder, { ref }, W, T) {
  const canvas = h('canvas', { class: 'gp-canvas' });
  const rec = h('div', { class: 'gp-tv' });
  const tower = h('div', { class: 'gp-timing' });
  fill(holder, canvas, rec, tower);
  const world = W.createCircuit(T, canvas, { tv: true });
  const shown = new Map();
  const SHOTS = [['tv', 'TRACKSIDE'], ['heli', 'HELICOPTER'], ['chase', 'ONBOARD'], ['front', 'FRONT CAM']];
  let t = 0; let shot = 0; let shotT = 0; let last = performance.now(); let towerText = '';
  const stop = loop(() => {}, () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t += dt; shotT += dt;
    if (shotT > 9) { shotT = 0; shot = (shot + 1) % SHOTS.length; world.cut(); }
    const list = ref.ranked();
    const ids = new Set(list.slice(0, 12).map((p) => p.uid));
    for (const id of [...world.cars.keys()]) if (!ids.has(id)) world.removeCar(id);
    list.slice(0, 12).forEach((p, i) => {
      const m = p.extra.m ?? p.score;
      const prev = shown.get(p.uid) ?? m;
      const v = p.extra.v || 0;
      const sm = prev + v * dt + (m + v * 0.5 - prev) * Math.min(1, dt * 0.8);
      shown.set(p.uid, sm);
      const c = world.carFor(p.uid, liveryOf(p.uid), `${i + 1}. ${p.name}`);
      world.placeCar(c, sm, laneOf(p.uid), v, dt, { boost: (p.extra.boost || 0) > 0 });
    });
    const leader = list[0] && world.cars.get(list[0].uid);
    if (leader) world.camera(SHOTS[shot][0], leader, list[0].extra.v || 0, t, dt);
    else world.camera('grid', null, 0, t, dt);
    world.render(dt, leader ? leader.g.position : { x: 0, z: 0 });
    rec.innerHTML = `<i class="${Math.floor(t * 1.6) % 2 ? 'off' : ''}"></i> LIVE · ${SHOTS[shot][1]}${list[0] ? ` · LEADER <b>${escapeHtml(list[0].name)}</b> · LAP ${lapsOf(list[0].extra.m ?? list[0].score) + 1}` : ' · CARS ON THE GRID'}`;
    const tt = list.slice(0, 10).map((p) => `${p.uid}${Math.floor((p.extra.m ?? p.score) / 50)}${p.extra.pit > 0}`).join('|');
    if (tt !== towerText) { towerText = tt; fill(tower, ...timingTower(list.slice(0, 10))); }
  });
  return () => { stop(); world.destroy(); };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
