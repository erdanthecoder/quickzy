// train.js — Train Travel: drive a steam train from the cab.
//
// Every right answer puts 2 coal in your tender. The firebox burns one coal
// every 3 seconds, and every coal burned carries you 500 m. Run out and the
// train coasts to a stop. The farthest train wins.
//
// The host keeps the coal and the distance (nobody can fake them); players
// see the line ahead from their cab, with the nearest rivals on the tracks
// beside them. The big screen is a camera car following the leader.

import { makeCanvas, loop, controls, drawBlook, nameTag, rr, lerp, hashString } from '../arcade/engine.js';
import { curveX } from './train3d.js';
import { preloadBlooks, blook } from '../../ui/blooks.js';
import { h, fill } from '../../ui/dom.js';
import { sfx } from '../sound.js';

export const COAL_PER_ANSWER = 2;
export const BURN_SECONDS = 3;
export const METRES_PER_COAL = 500;
export const START_COAL = 2;
const SPEED = METRES_PER_COAL / BURN_SECONDS;      // m/s while the fire burns
const UNIT = 5;                                    // metres in one world unit
export const km = (m) => `${(m / 1000).toFixed(1)} km`;

/* ================================================================== host */

export function createHost({ live, P, players, dirty }) {
  const send = (p) => {
    const e = p.extra;
    p.meExtra = { ...(p.meExtra || {}), tr: { c: e.coal, f: Math.round(e.fire * 100) / 100, m: Math.floor(e.m) } };
    dirty.add(p.uid);
  };
  let last = 0;
  return {
    // the score is the distance, nothing else
    answerPoints: false,
    join(p) { if (p.extra.m === undefined) { Object.assign(p.extra, { coal: START_COAL, fire: 0, m: 0, summary: '0.0 km' }); send(p); } },
    grant(p, ok) {
      if (!ok) return 0;
      p.extra.coal += COAL_PER_ANSWER;
      send(p);
      return COAL_PER_ANSWER;
    },
    tick(now) {
      const secs = last ? Math.min(3, (now - last) / 1000) : 0;
      last = now;
      const race = {};
      for (const p of players.values()) {
        const e = p.extra;
        if (e.m === undefined) continue;
        burn(e, secs);
        const score = Math.floor(e.m);
        if (score !== p.score) { p.score = score; e.summary = km(e.m); }
        send(p);
        race[p.uid] = score;
      }
      live.set(P('race'), race).catch(() => {});
    },
  };
}

/** Burn coal for `secs` seconds: a coal lasts BURN_SECONDS and carries METRES_PER_COAL. */
export function burn(e, secs) {
  let left = secs;
  while (left > 1e-9) {
    if (e.fire <= 0) {
      if (e.coal <= 0) { e.fire = 0; return; }
      e.coal -= 1; e.fire = BURN_SECONDS;
    }
    const use = Math.min(e.fire, left);
    e.fire -= use; left -= use;
    e.m += use * SPEED;
  }
}

/* ============================================================== drawing */

const SKY = ['#2f5f9e', '#7fb0dc', '#f3d6a6'];
const HAZE = '#c9d6e3';

function noise(x) {
  const i = Math.floor(x); const f = x - i;
  const r = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return r(i) * (1 - u) + r(i + 1) * u;
}
const ridge = (x, oct = 4) => { let v = 0; let a = 0.5; let fq = 1; for (let i = 0; i < oct; i++) { v += noise(x * fq) * a; a /= 2; fq *= 2.1; } return v; };

export function drawSkyAndHills(ctx, w, hor, shift, t, warm = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, hor);
  g.addColorStop(0, SKY[0]); g.addColorStop(0.55, SKY[1]); g.addColorStop(1, SKY[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hor + 2);
  // the sun, low and warm, with a glow
  const sx = w * 0.22 - shift * 0.05; const sy = hor * 0.62;
  const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, hor * 0.7);
  sg.addColorStop(0, `rgba(255,244,214,${0.95 * warm})`); sg.addColorStop(0.08, 'rgba(255,226,160,.55)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, w, hor);
  ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(10, hor * 0.06), 0, Math.PI * 2); ctx.fill();
  // soft clouds, drifting
  for (let i = 0; i < 9; i++) {
    const cw = w * (0.12 + (i % 4) * 0.05);
    const x = ((i * 397 + t * (4 + (i % 3) * 3) - shift * 0.12) % (w + cw * 2) + w + cw * 2) % (w + cw * 2) - cw;
    const y = hor * (0.12 + ((i * 0.37) % 0.55));
    for (let k = 0; k < 5; k++) {
      const rx = cw * (0.25 + noise(i * 9 + k) * 0.25);
      const cg = ctx.createRadialGradient(x + k * cw * 0.18, y - noise(i + k * 3) * cw * 0.12, 1, x + k * cw * 0.18, y, rx);
      cg.addColorStop(0, 'rgba(255,255,255,.75)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg; ctx.fillRect(x + k * cw * 0.18 - rx, y - rx, rx * 2, rx * 2);
    }
  }
  // three ranges of mountains, hazier the farther they are
  const ranges = [['#8ea6c4', 0.42, 0.02, 380], ['#6f8aa8', 0.3, 0.05, 260], ['#4f6a5c', 0.16, 0.1, 170]];
  for (const [col, hgt, par, wl] of ranges) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, hor + 1);
    for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, hor - ridge((x + shift * par) / wl) * hor * hgt);
    ctx.lineTo(w, hor + 1); ctx.closePath(); ctx.fill();
  }
  const hz = ctx.createLinearGradient(0, hor - hor * 0.12, 0, hor);
  hz.addColorStop(0, 'rgba(232,220,200,0)'); hz.addColorStop(1, 'rgba(232,220,200,.55)');
  ctx.fillStyle = hz; ctx.fillRect(0, hor - hor * 0.12, w, hor * 0.12 + 1);
}

export function pine(ctx, x, y, s, fog) {
  if (s < 0.6) return;
  ctx.fillStyle = `rgb(${lerp(58, 201, fog)},${lerp(44, 214, fog)},${lerp(30, 227, fog)})`;
  ctx.fillRect(x - s * 0.08, y - s * 0.35, s * 0.16, s * 0.35);
  const c = [lerp(26, 201, fog), lerp(70, 214, fog), lerp(42, 227, fog)].map(Math.round);
  const c2 = [lerp(44, 201, fog), lerp(98, 214, fog), lerp(58, 227, fog)].map(Math.round);
  for (let k = 0; k < 3; k++) {
    const ty = y - s * (0.3 + k * 0.32); const tw = s * (0.42 - k * 0.1);
    ctx.fillStyle = `rgb(${c})`;
    ctx.beginPath(); ctx.moveTo(x, ty - s * 0.5); ctx.lineTo(x + tw, ty); ctx.lineTo(x - tw, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgb(${c2})`;
    ctx.beginPath(); ctx.moveTo(x, ty - s * 0.5); ctx.lineTo(x + tw * 0.15, ty); ctx.lineTo(x - tw, ty); ctx.closePath(); ctx.fill();
  }
}

/** A steam locomotive and tender, side on, facing right. y is the rail top. */
export function drawLoco(ctx, x, y, s, { t = 0, wheel = 0, body = '#8a1f1f', blookId = null, lamp = true } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const metal = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#3a3d44'); g.addColorStop(0.35, '#6a6f7a'); g.addColorStop(0.55, '#2a2c31'); g.addColorStop(1, '#141518'); return g; };
  // shadow on the ballast
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(-20, 4, 150, 7, 0, 0, Math.PI * 2); ctx.fill();
  // tender
  ctx.fillStyle = metal(-72, -20); rr(ctx, -160, -72, 96, 52, 5); ctx.fill();
  ctx.fillStyle = body; ctx.fillRect(-160, -46, 96, 6);
  ctx.fillStyle = '#121212';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-150 + i * 15, -72, 9 + (i % 2) * 3, Math.PI, 0); ctx.fill(); }
  // cab
  ctx.fillStyle = body; ctx.fillRect(-62, -104, 52, 84);
  ctx.fillStyle = '#1b1b1f'; ctx.fillRect(-68, -112, 64, 10);
  ctx.fillStyle = '#ffd98a'; rr(ctx, -54, -96, 34, 28, 4); ctx.fill();
  if (blookId) drawBlook(ctx, blookId, -37, -80, 28);
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(-54, -96, 34, 28);
  // boiler: a shaded cylinder with brass bands
  ctx.fillStyle = metal(-80, -28); rr(ctx, -12, -80, 110, 52, 22); ctx.fill();
  ctx.fillStyle = '#c9a24a';
  for (const bx of [10, 40, 70]) ctx.fillRect(bx, -80, 4, 52);
  ctx.fillStyle = '#222'; rr(ctx, 86, -84, 18, 60, 8); ctx.fill();       // smokebox
  ctx.fillStyle = metal(-110, -80); rr(ctx, 74, -114, 16, 34, 3); ctx.fill(); // chimney
  ctx.fillStyle = '#111'; rr(ctx, 70, -118, 24, 7, 3); ctx.fill();
  ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.ellipse(36, -82, 13, 12, 0, Math.PI, 0); ctx.fill();   // dome
  ctx.fillStyle = metal(-95, -80); ctx.beginPath(); ctx.ellipse(6, -82, 9, 9, 0, Math.PI, 0); ctx.fill();
  if (lamp) {
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(104, -70, 6, 0, Math.PI * 2); ctx.fill();
    const lg = ctx.createRadialGradient(108, -70, 2, 108, -70, 46); lg.addColorStop(0, 'rgba(255,240,180,.5)'); lg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = lg; ctx.fillRect(60, -116, 100, 92);
  }
  // frame, cowcatcher
  ctx.fillStyle = '#7a1414'; ctx.fillRect(-64, -30, 176, 10);
  ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.moveTo(104, -22); ctx.lineTo(132, -2); ctx.lineTo(104, -2); ctx.closePath(); ctx.fill();
  // wheels: three drivers with turning spokes, a rod between them
  const spoked = (cx, cy, r) => {
    ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8952f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = wheel + (k * Math.PI) / 4; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); }
    ctx.stroke();
    ctx.fillStyle = '#b8952f'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  };
  for (const cx of [-146, -114, -82]) spoked(cx, -11, 11);
  for (const cx of [-2, 34, 70]) spoked(cx, -20, 20);
  spoked(98, -9, 9);
  const px = Math.cos(wheel) * 10; const py = Math.sin(wheel) * 10;
  ctx.strokeStyle = '#d8d8de'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2 + px, -20 + py); ctx.lineTo(70 + px, -20 + py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(34 + px, -20 + py); ctx.lineTo(96, -36); ctx.stroke();
  ctx.restore();
}

/* ================================================================ player */

function mountPlayer2D(game) {
  const { stage, uid, live, P } = game;
  const view = makeCanvas(stage);
  const ctl = controls(stage, { joystick: true, buttons: [{ id: 'coal', label: '⛏ Get coal', className: 'is-right' }] });
  const puffs = [];                  // chimney smoke, in boiler space
  game.grantText = (g) => `+${g} coal in the tender`;

  const names = new Map();
  let race = {};
  let coal = START_COAL; let fire = 0; let serverM = 0; let myM = 0;
  let yaw = 0; let lean = 0; let t = 0; let travel = 0;
  let lastSide = new Map();
  const lanes = new Map();            // uid -> lane (-2…2, not 0)
  let outWarned = 0;

  const unsubs = [];
  unsubs.push(live.on(P('players'), (val) => {
    for (const [u, p] of Object.entries(val || {})) names.set(u, p);
    preloadBlooks([...names.values()].map((p) => p.blook));
  }));
  unsubs.push(live.on(P(`me/${uid}`), (m) => {
    if (!m || !m.tr) return;
    coal = m.tr.c; fire = m.tr.f; serverM = m.tr.m;
  }));
  unsubs.push(live.on(P('race'), (r) => {
    race = r || {};
    // who passed whom
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      const side = Math.sign(d - myM);
      const was = lastSide.get(u);
      const who = names.get(u)?.name || 'Someone';
      if (was === -1 && side === 1) { game.flash(`${who} passed you!`, 'is-bad'); }
      if (was === 1 && side === -1) { game.flash(`You passed ${who}!`, 'is-ok'); sfx('coin'); }
      if (side) lastSide.set(u, side);
    }
    // keep the nearest four on the tracks beside you, each in its own lane
    const near = Object.entries(race).filter(([u]) => u !== uid).sort((a, b) => Math.abs(a[1] - myM) - Math.abs(b[1] - myM)).slice(0, 4).map(([u]) => u);
    for (const u of [...lanes.keys()]) if (!near.includes(u)) lanes.delete(u);
    for (const u of near) {
      if (lanes.has(u)) continue;
      const free = [-1, 1, -2, 2].find((l) => ![...lanes.values()].includes(l));
      if (free !== undefined) lanes.set(u, free);
    }
  }));

  const getCoal = async () => {
    if (game.asking) return;
    await game.ask({ title: 'Answer right for 2 coal' });
  };
  const keys = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'KeyC' || e.code === 'KeyE' || e.code === 'KeyQ') { e.preventDefault(); getCoal(); }
  };
  window.addEventListener('keydown', keys);

  const burning = () => fire > 0 || coal > 0;
  const stop = loop((dt) => {
    t += dt;
    ctl.update();
    if (!game.asking) {
      if (ctl.tapped('coal')) getCoal();
      if (ctl.tapped('action')) sfx('whistle');               // the whistle
    } else ctl.clear();
    // look around the cab, lean out of the window
    yaw = lerp(yaw, ctl.x * 0.9, 0.08);
    lean = lerp(lean, Math.max(0, -ctl.y), 0.08);
    // run the fire here too, so the train moves smoothly between updates
    const was = myM;
    const e = { coal, fire, m: myM };
    burn(e, dt);
    coal = e.coal; fire = e.fire; myM = e.m;
    myM += (serverM - myM) * Math.min(1, dt * 1.5);
    if (Math.abs(serverM - myM) > METRES_PER_COAL * 1.5) myM = serverM;
    const v = Math.max(0, myM - was) / dt;
    travel += (v / UNIT) * dt * 0.35;
    if (!burning() && t > outWarned) { outWarned = t + 5; game.flash('Out of coal! Answer to keep moving', 'is-bad'); }
    // smoke from the chimney
    if (burning() && Math.random() < 0.5) puffs.push({ x: 0, y: 0, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, life: 1.6, size: 10 + Math.random() * 10 });
    for (const p of puffs) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].life <= 0) puffs.splice(i, 1);
    game.setMeter('Coal', Math.min(1, (coal + fire / BURN_SECONDS) / 10), `${coal}`);
  }, () => {
    const { ctx, w, h: hh } = view;
    view.begin();
    const moving = burning();
    const rumble = moving ? Math.sin(t * 38) * 0.9 + Math.sin(t * 13) * 0.6 : 0;
    // the window: everything outside is drawn first, the cab on top
    const winTop = hh * 0.08; const winBot = hh * 0.72;
    const hor = winTop + (winBot - winTop) * (0.5 - lean * 0.12) + rumble;
    const cx = w / 2 - yaw * w * 0.55;
    const f = (w * 0.9) * (1 + lean * 0.25);
    const camH = 2.4;
    const far = 420;
    drawSkyAndHills(ctx, w, hor, travel * 6 + yaw * w, t);
    // ground with rows rushing past
    const gg = ctx.createLinearGradient(0, hor, 0, hh);
    gg.addColorStop(0, '#b9b98a'); gg.addColorStop(0.15, '#7d8a4c'); gg.addColorStop(1, '#3f5226');
    ctx.fillStyle = gg; ctx.fillRect(0, hor, w, hh - hor);
    const proj = (X, Y, Z) => {
      const curve = Math.sin(travel / 220) * 0.0016 * Z * Z;
      return [cx + (X - curve) * f / Z, hor + (camH - Y) * f / Z];
    };
    const ph = travel % 8;
    for (let k = 0; k < 60; k++) {
      const z0 = Math.max(1.2, k * 8 - ph); const z1 = (k + 1) * 8 - ph;
      if (z1 <= 1.2) continue;
      if (((k + Math.floor(travel / 8)) % 2) === 0) continue;
      const y0 = hor + camH * f / z1; const y1 = hor + camH * f / z0;
      ctx.fillStyle = `rgba(0,0,0,${0.06 * (1 - z0 / far)})`; ctx.fillRect(0, y0, w, y1 - y0);
    }
    // the tracks: ours, and one each side for every rival nearby
    const laneX = (l) => l * 4.4;
    const drawTrack = (X) => {
      const zs = []; for (let z = 1.2; z < far; z *= 1.08) zs.push(z);
      ctx.fillStyle = '#8b7d6b'; ctx.beginPath();
      zs.forEach((z, i) => { const [x, y] = proj(X - 1.7, 0, z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      [...zs].reverse().forEach((z) => { const [x, y] = proj(X + 1.7, 0, z); ctx.lineTo(x, y); });
      ctx.fill();
      const tp = travel % 1.1;
      for (let z = 70; z > 1.2; z -= 1.1) {
        const zz = z - tp; if (zz < 1.2) continue;
        const [x1, y1] = proj(X - 1.15, 0, zz); const [x2] = proj(X + 1.15, 0, zz);
        const th = Math.max(1, 0.18 * f / zz);
        ctx.fillStyle = `rgba(74,52,36,${1 - zz / 80})`; ctx.fillRect(x1, y1 - th / 2, x2 - x1, th);
      }
      for (const side of [-0.72, 0.72]) {
        ctx.strokeStyle = '#4a4e57'; ctx.lineWidth = 1; ctx.beginPath();
        zs.forEach((z, i) => { const [x, y] = proj(X + side, 0.1, z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        // the shiny top of the rail, thicker up close
        for (let i = 0; i < zs.length - 1; i++) {
          const [xa, ya] = proj(X + side, 0.12, zs[i]); const [xb, yb] = proj(X + side, 0.12, zs[i + 1]);
          ctx.strokeStyle = `rgba(232,236,242,${0.9 - i / zs.length})`; ctx.lineWidth = Math.max(0.6, 0.12 * f / zs[i]);
          ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
        }
      }
    };
    const used = [...new Set([0, ...lanes.values()])].sort((a, b) => Math.abs(b) - Math.abs(a));
    for (const l of used) drawTrack(laneX(l));
    // trees and telegraph poles, far to near
    const props = [];
    const seg = 7; const base = Math.floor(travel / seg);
    for (let i = 0; i < far / seg; i++) {
      const idx = base + i; const z = idx * seg - travel;
      if (z < 1.3) continue;
      for (const side of [-1, 1]) {
        const hsh = hashString(`${idx}:${side}`);
        if (hsh % 3 === 0) props.push({ z, X: side * (14 + (hsh % 23)), kind: 'tree', sz: 5 + (hsh % 5) });
        if (hsh % 7 === 1) props.push({ z: z + 2, X: side * (22 + (hsh % 30)), kind: 'tree', sz: 7 + (hsh % 4) });
      }
      if (idx % 5 === 0) props.push({ z, X: -3.2, kind: 'pole' });
    }
    // rival trains, ahead of you on their tracks
    for (const [u, l] of lanes) {
      const d = race[u]; if (d === undefined) continue;
      const dz = (d - myM) / UNIT;
      if (dz < -4 || dz > far) continue;
      props.push({ z: Math.max(11, dz + 16), X: laneX(l), kind: 'train', u, dm: d - myM });
    }
    props.sort((a, b) => b.z - a.z);
    let lastPole = null;
    for (const p of props) {
      const fog = Math.min(1, p.z / far) ** 1.3;
      const [x, y] = proj(p.X, 0, p.z);
      const s = f / p.z;
      if (p.kind === 'tree') pine(ctx, x, y, p.sz * s, fog * 0.85);
      if (p.kind === 'pole') {
        const [, top] = proj(p.X, 6, p.z);
        ctx.strokeStyle = `rgba(70,50,35,${1 - fog})`; ctx.lineWidth = Math.max(1, 0.25 * s);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); ctx.moveTo(x - 0.8 * s, top + 0.4 * s); ctx.lineTo(x + 0.8 * s, top + 0.4 * s); ctx.stroke();
        if (lastPole) {
          ctx.strokeStyle = `rgba(40,40,40,${0.6 - fog * 0.5})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(lastPole[0], lastPole[1]); ctx.quadraticCurveTo((lastPole[0] + x) / 2, (lastPole[1] + top) / 2 + 0.6 * s, x, top + 0.4 * s); ctx.stroke();
        }
        lastPole = [x, top + 0.4 * s];
      }
      if (p.kind === 'train') {
        // the back of their tender, with smoke rolling over it
        const tw = 3.2 * s; const th = 3.6 * s;
        ctx.globalAlpha = 1 - fog * 0.7;
        ctx.fillStyle = '#26272c'; rr(ctx, x - tw / 2, y - th, tw, th, 0.2 * s); ctx.fill();
        ctx.fillStyle = '#7a1414'; ctx.fillRect(x - tw / 2, y - th * 0.35, tw, th * 0.08);
        ctx.fillStyle = '#121212'; ctx.beginPath(); ctx.ellipse(x, y - th, tw * 0.45, th * 0.12, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#e8112d'; ctx.beginPath(); ctx.arc(x + tw * 0.35, y - th * 0.55, Math.max(1.5, 0.18 * s), 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = `rgba(235,235,240,${0.35 - k * 0.07})`;
          ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + k) * s * 0.4, y - th - s * (1.2 + k * 1.1), s * (0.7 + k * 0.45), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const info = names.get(p.u);
        if (info && s > 1.2) {
          drawBlook(ctx, info.blook, x, y - th - Math.min(40, s * 1.6), Math.min(44, Math.max(18, s * 1.6)));
          nameTag(ctx, `${info.name} · ${p.dm >= 0 ? '+' : ''}${km(p.dm)}`, x, y - th - Math.min(66, s * 3.2), { size: 11, bg: p.dm > 0 ? 'rgba(232,17,45,.85)' : 'rgba(18,201,166,.9)' });
        }
      }
    }
    // our own boiler, stretching out in front of the cab window
    const bx = w / 2 + rumble * 0.4; const by = winBot + 2;
    const bw = w * 0.36; const topW = w * 0.12; const bTop = hor + (winBot - hor) * 0.38;
    const bg = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    bg.addColorStop(0, '#0d0e11'); bg.addColorStop(0.3, '#3b3f48'); bg.addColorStop(0.45, '#6b717d'); bg.addColorStop(0.6, '#2b2e35'); bg.addColorStop(1, '#0b0c0e');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(bx - bw / 2, by); ctx.lineTo(bx - topW / 2, bTop); ctx.quadraticCurveTo(bx, bTop - topW * 0.25, bx + topW / 2, bTop); ctx.lineTo(bx + bw / 2, by); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8952f'; ctx.lineWidth = 3;
    for (const k of [0.25, 0.55, 0.8]) {
      const yy = bTop + (by - bTop) * k; const ww = topW + (bw - topW) * k;
      ctx.beginPath(); ctx.moveTo(bx - ww / 2, yy); ctx.quadraticCurveTo(bx, yy - ww * 0.12, bx + ww / 2, yy); ctx.stroke();
    }
    // dome and chimney on top of the boiler
    const domeY = bTop + (by - bTop) * 0.42; const domeW = topW + (bw - topW) * 0.42;
    ctx.fillStyle = '#b8952f'; ctx.beginPath(); ctx.ellipse(bx, domeY - domeW * 0.1, domeW * 0.16, domeW * 0.14, 0, Math.PI, 0); ctx.fill();
    const chY = bTop + 4; const chW = topW * 0.32;
    ctx.fillStyle = '#16171b'; ctx.fillRect(bx - chW / 2, chY - chW * 1.4, chW, chW * 1.4);
    ctx.fillRect(bx - chW * 0.7, chY - chW * 1.55, chW * 1.4, chW * 0.25);
    // smoke from our chimney, rolling back over the cab
    for (const p of puffs) {
      const life = Math.max(0, p.life / 1.6);
      const r = p.size * (1 + (1 - life) * 4) * (w / 900);
      const x = bx + p.x * (2 - life); const y = chY - chW * 1.5 + p.y * (2.2 - life) * 1.4;
      ctx.fillStyle = `rgba(240,240,244,${0.28 * life})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // the cab around the window
    const frame = '#2a1d14';
    const wood = ctx.createLinearGradient(0, 0, 0, hh);
    wood.addColorStop(0, '#3b2a1e'); wood.addColorStop(1, '#1d140d');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.rect(0, 0, w, hh);
    const side = w * 0.06; const r = Math.min(w, hh) * 0.05;
    ctx.moveTo(side + r, winTop); ctx.lineTo(side, winTop + r); ctx.lineTo(side, winBot); ctx.lineTo(w - side, winBot); ctx.lineTo(w - side, winTop + r); ctx.lineTo(w - side - r, winTop); ctx.closePath();
    ctx.fill('evenodd');
    ctx.strokeStyle = '#0f0a06'; ctx.lineWidth = 6; ctx.strokeRect(side, winTop, w - side * 2, winBot - winTop);
    ctx.strokeStyle = frame; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(w / 2, winTop); ctx.lineTo(w / 2, winTop + (winBot - winTop) * 0.12); ctx.stroke();
    // rivets
    ctx.fillStyle = '#6b5236';
    for (let x = side * 0.5; x < w; x += Math.max(26, w / 30)) { ctx.beginPath(); ctx.arc(x, winTop * 0.5, 2.5, 0, Math.PI * 2); ctx.fill(); }
    // glass glare
    const glare = ctx.createLinearGradient(side, winTop, w * 0.5, winBot);
    glare.addColorStop(0, 'rgba(255,255,255,.10)'); glare.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare; ctx.fillRect(side, winTop, w - side * 2, winBot - winTop);
    // the dashboard: firebox, gauges, coal pile, distance plate
    const dashY = winBot + 6; const dashH = hh - dashY;
    const fb = Math.min(dashH * 0.75, w * 0.18);
    const fx0 = w / 2 - fb / 2; const fy0 = dashY + (dashH - fb * 0.8) / 2;
    ctx.fillStyle = '#1a1a1d'; rr(ctx, fx0 - 8, fy0 - 8, fb + 16, fb * 0.8 + 16, 10); ctx.fill();
    const glow = moving ? 0.75 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.1 : 0.15;
    const fg = ctx.createRadialGradient(w / 2, fy0 + fb * 0.55, 2, w / 2, fy0 + fb * 0.4, fb * 0.7);
    fg.addColorStop(0, `rgba(255,236,150,${glow})`); fg.addColorStop(0.4, `rgba(255,120,30,${glow})`); fg.addColorStop(1, `rgba(90,20,0,${glow * 0.8})`);
    ctx.fillStyle = fg; rr(ctx, fx0, fy0, fb, fb * 0.8, 8); ctx.fill();
    ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 3;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(fx0 + (fb * k) / 5, fy0); ctx.lineTo(fx0 + (fb * k) / 5, fy0 + fb * 0.8); ctx.stroke(); }
    if (moving) { const lg = ctx.createRadialGradient(w / 2, fy0, 4, w / 2, fy0, w * 0.4); lg.addColorStop(0, `rgba(255,140,40,${glow * 0.25})`); lg.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = lg; ctx.fillRect(0, dashY - hh * 0.2, w, hh); }
    // gauges
    const gauge = (gx, gy, gr, frac, label) => {
      ctx.fillStyle = '#b8952f'; ctx.beginPath(); ctx.arc(gx, gy, gr + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4ecd8'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
      for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.8 + (k / 10) * Math.PI * 1.4; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * gr * 0.78, gy + Math.sin(a) * gr * 0.78); ctx.lineTo(gx + Math.cos(a) * gr * 0.92, gy + Math.sin(a) * gr * 0.92); ctx.stroke(); }
      const a = Math.PI * 0.8 + Math.max(0, Math.min(1, frac)) * Math.PI * 1.4 + (moving ? Math.sin(t * 20) * 0.02 : 0);
      ctx.strokeStyle = '#c0161e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * gr * 0.8, gy + Math.sin(a) * gr * 0.8); ctx.stroke();
      ctx.fillStyle = '#3a2a1a'; ctx.font = `800 ${Math.max(8, gr * 0.22)}px Figtree, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, gx, gy + gr * 0.45);
    };
    const gr = Math.min(dashH * 0.32, w * 0.06);
    gauge(w / 2 - fb / 2 - gr * 1.6, dashY + dashH * 0.42, gr, fire / BURN_SECONDS * 0.6 + (coal > 0 ? 0.35 : 0), 'STEAM');
    gauge(w / 2 + fb / 2 + gr * 1.6, dashY + dashH * 0.42, gr, Math.min(1, coal / 10), 'COAL');
    // coal pile on the left
    const cx0 = side * 0.6; const cy0 = hh - 10;
    for (let k = 0; k < Math.min(18, coal * 2); k++) {
      const hx = cx0 + (k % 6) * Math.min(18, w * 0.022) + (Math.floor(k / 6) % 2) * 6;
      const hy = cy0 - Math.floor(k / 6) * 12;
      ctx.fillStyle = k % 3 ? '#151515' : '#2b2b2b'; ctx.beginPath(); ctx.ellipse(hx + 8, hy - 6, 9, 7, k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f4ecd8';
    ctx.font = `800 ${Math.max(12, Math.min(18, w * 0.022))}px Figtree, system-ui`;
    ctx.fillText(`Coal × ${coal}`, cx0, hh - Math.min(64, dashH * 0.7));
    // brass distance plate on the right
    const pw = Math.min(220, w * 0.26); const phh = Math.min(70, dashH * 0.7);
    const plx = w - pw - side * 0.6; const ply = dashY + (dashH - phh) / 2;
    const pg = ctx.createLinearGradient(0, ply, 0, ply + phh); pg.addColorStop(0, '#e2c46e'); pg.addColorStop(1, '#9a7a2a');
    ctx.fillStyle = pg; rr(ctx, plx, ply, pw, phh, 8); ctx.fill();
    ctx.strokeStyle = '#6a5016'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2a1d0a'; ctx.textAlign = 'center';
    ctx.font = `400 ${Math.round(phh * 0.5)}px "Bricolage Grotesque", system-ui`;
    ctx.fillText(km(myM), plx + pw / 2, ply + phh * 0.62);
    ctx.font = `800 ${Math.round(phh * 0.17)}px Figtree, system-ui`;
    ctx.fillText(moving ? 'FULL STEAM' : 'STOPPED · NEED COAL', plx + pw / 2, ply + phh * 0.88);
    // who is just ahead and just behind
    let ahead = null; let behind = null;
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      if (d > myM && (!ahead || d < ahead[1])) ahead = [u, d];
      if (d <= myM && (!behind || d > behind[1])) behind = [u, d];
    }
    ctx.font = '800 13px Figtree, system-ui'; ctx.textAlign = 'right';
    if (ahead) nameTag(ctx, `▲ ${names.get(ahead[0])?.name || '?'} ${km(ahead[1] - myM)} ahead`, w - side - 90, winTop + 18, { size: 12, bg: 'rgba(232,17,45,.85)' });
    if (behind) nameTag(ctx, `▼ ${names.get(behind[0])?.name || '?'} ${km(myM - behind[1])} behind`, w - side - 90, winTop + 42, { size: 12, bg: 'rgba(18,201,166,.9)' });
    if (!moving) {
      ctx.fillStyle = `rgba(0,0,0,${0.18 + Math.sin(t * 4) * 0.06})`; ctx.fillRect(side, winTop, w - side * 2, winBot - winTop);
      nameTag(ctx, 'The fire is out: answer a question for coal!', w / 2, winTop + (winBot - winTop) * 0.3, { size: 15, bg: 'rgba(232,17,45,.92)' });
    }
  });

  return () => { stop(); ctl.destroy(); view.destroy(); unsubs.forEach((u) => u()); window.removeEventListener('keydown', keys); };
}

/* =========================================================== big screen */

const BODY = ['#8a1f1f', '#1f4e8a', '#1f7a4a', '#6b3fa0', '#a0601f', '#2a2a2e', '#8a1f6b', '#1f7a7a'];

function mountScreen2D(el, { ref }) {
  const view = makeCanvas(el);
  let t = 0; let camM = 0; let cut = 0;
  const shownM = new Map();
  const smoke = [];
  const stop = loop((dt) => {
    t += dt; cut += dt;
    for (const s of smoke) { s.x -= s.vx * dt; s.y -= 22 * dt; s.r += 14 * dt; s.a -= dt * 0.35; }
    for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].a <= 0) smoke.splice(i, 1);
  }, () => {
    const { ctx, w, h: hh } = view;
    view.begin();
    const list = ref.ranked().slice(0, 6);
    const leader = list[0];
    const lead = leader ? (leader.extra.m ?? leader.score) : 0;
    camM = lerp(camM, lead, 0.04);
    const hor = hh * 0.46;
    drawSkyAndHills(ctx, w, hor, camM * 0.6, t);
    const gg = ctx.createLinearGradient(0, hor, 0, hh);
    gg.addColorStop(0, '#a7a77a'); gg.addColorStop(0.25, '#76844a'); gg.addColorStop(1, '#3a4b22');
    ctx.fillStyle = gg; ctx.fillRect(0, hor, w, hh - hor);
    // tree line on the far side, moving with the camera
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97 - camM * 0.9) % (w + 200) + w + 200) % (w + 200) - 100;
      pine(ctx, x, hor + 14 + (i % 3) * 4, 30 + (i % 4) * 10, 0.45);
    }
    // one track per train, the leader's nearest the camera
    const rows = Math.max(1, list.length);
    const rowY = (i) => hor + 30 + (hh - hor - 70) * ((rows - i) / rows) ** 1.25;
    const rowS = (i) => 0.45 + 0.75 * ((rows - i) / rows) ** 1.4;
    const pxPerM = w / 3000;                     // 3 km across the screen
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const y = rowY(i); const s = Math.min(1.35, rowS(i) * (w / 1200));
      // ballast, sleepers, rails
      ctx.fillStyle = '#8b7d6b'; ctx.fillRect(0, y - 2, w, 10 * s);
      const tp = ((camM * pxPerM * 4) % (18 * s));
      ctx.fillStyle = '#4a3424';
      for (let x = -tp; x < w; x += 18 * s) ctx.fillRect(x, y + 1, 9 * s, 5 * s);
      ctx.fillStyle = '#c9ced8'; ctx.fillRect(0, y - 1, w, Math.max(1.5, 2.2 * s));
      const m = lerp(shownM.get(p.uid) ?? (p.extra.m ?? p.score), p.extra.m ?? p.score, 0.06);
      shownM.set(p.uid, m);
      const x = w * 0.62 + (m - camM) * pxPerM;
      const moving = (p.extra.fire || 0) > 0 || (p.extra.coal || 0) > 0;
      if (moving && Math.random() < 0.5) smoke.push({ x: x + 82 * s, y: y - 118 * s, vx: 60, r: 10 * s, a: 0.7 * s });
      if (x > -200 && x < w + 200) {
        drawLoco(ctx, x, y, s, { t, wheel: m / 6, body: BODY[hashString(p.uid) % BODY.length], blookId: p.blook });
        nameTag(ctx, `${i + 1}. ${p.name} · ${km(m)}`, x - 20 * s, y - 132 * s, { size: Math.round(10 + 5 * s), bg: i === 0 ? '#ffcd1f' : 'rgba(23,19,63,.85)', fg: i === 0 ? '#17133f' : '#fff' });
      } else if (x <= -200) {
        nameTag(ctx, `◀ ${p.name} ${km(camM - m)} behind`, 110, y - 30 * s, { size: 13, bg: 'rgba(23,19,63,.85)' });
      }
    }
    for (const s of smoke) { ctx.fillStyle = `rgba(236,236,240,${Math.max(0, s.a) * 0.6})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
    // cinematic bars and the camera overlay
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hh * 0.06); ctx.fillRect(0, hh * 0.94, w, hh * 0.06);
    const vg = ctx.createRadialGradient(w / 2, hh / 2, Math.min(w, hh) * 0.3, w / 2, hh / 2, Math.max(w, hh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, hh);
    ctx.font = '800 15px Figtree, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(26, hh * 0.03, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff';
    ctx.fillText(leader ? `REC  ·  CAM 1  ·  FOLLOWING THE LEADER: ${leader.name.toUpperCase()}  ·  ${km(lead)}` : 'REC  ·  CAM 1  ·  WAITING AT THE STATION', 40, hh * 0.03);
    // the standings, top right
    const bw = Math.min(300, w * 0.28); const bx = w - bw - 18; let by = hh * 0.08;
    ctx.fillStyle = 'rgba(15,12,40,.72)'; rr(ctx, bx, by, bw, 34 + list.length * 34, 12); ctx.fill();
    ctx.fillStyle = '#ffcd1f'; ctx.font = '400 18px "Bricolage Grotesque", system-ui'; ctx.fillText('Farthest trains', bx + 14, by + 18);
    by += 34;
    list.forEach((p, i) => {
      drawBlook(ctx, p.blook, bx + 26, by + 16, 24);
      ctx.fillStyle = '#fff'; ctx.font = '800 14px Figtree, system-ui'; ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${p.name}`.slice(0, 18), bx + 46, by + 16);
      ctx.textAlign = 'right'; ctx.fillStyle = i === 0 ? '#ffcd1f' : '#cfd3ff';
      ctx.fillText(km(p.extra.m ?? p.score), bx + bw - 14, by + 16);
      by += 34;
    });
  });
  return () => { stop(); view.destroy(); };
}


/* ============================================================ 3D views */

// The 3D world needs three.js from the web; without it (or without WebGL)
// the 2D views above take over.
const load3D = () => Promise.all([import('./train3d.js'), import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js')]);
const want3D = () => !navigator.webdriver || (() => { try { return localStorage.getItem('quickzy.test.3d') === '1'; } catch { return false; } })();

export function mountPlayer(game) {
  if (!want3D()) return mountPlayer2D(game);
  let cleanup = null; let gone = false;
  const holder = h('div', { class: 'tr3' }, h('div', { class: 'tr3-loading' }, 'Loading your train…'));
  game.stage.append(holder);
  load3D().then(([W, T]) => {
    if (gone) return;
    try { cleanup = mountPlayer3D(game, holder, W, T); } catch (err) { console.warn(err); holder.remove(); cleanup = mountPlayer2D(game); }
  }).catch(() => { if (!gone) { holder.remove(); cleanup = mountPlayer2D(game); } });
  return () => { gone = true; if (cleanup) cleanup(); holder.remove(); };
}

export function mountScreen(el, opts) {
  let cleanup = null; let gone = false;
  const holder = h('div', { class: 'tr3' });
  el.append(holder);
  load3D().then(([W, T]) => {
    if (gone) return;
    try { cleanup = mountScreen3D(holder, opts, W, T); } catch (err) { console.warn(err); holder.remove(); cleanup = mountScreen2D(el, opts); }
  }).catch(() => { if (!gone) { holder.remove(); cleanup = mountScreen2D(el, opts); } });
  return () => { gone = true; if (cleanup) cleanup(); holder.remove(); };
}

function mountPlayer3D(game, holder, W, T) {
  const { uid, live, P } = game;
  const canvas = h('canvas', { class: 'tr3-canvas' });
  const coalEl = h('b', {}); const lumps = h('div', { class: 'tr3-lumps' });
  const kmEl = h('b', {}); const stateEl = h('small', {});
  const aheadEl = h('div', { class: 'tr3-chip is-ahead', hidden: true }); const behindEl = h('div', { class: 'tr3-chip is-behind', hidden: true });
  const outEl = h('div', { class: 'tr3-out', hidden: true }, 'The fire is out! Answer a question for coal');
  const camBtn = h('button', { class: 'tr3-cam', type: 'button' }, '🎥 View');
  const gauge = h('div', { class: 'tr3-gauge' }, h('i'), h('small', {}, 'STEAM'));
  fill(holder, canvas,
    h('div', { class: 'tr3-near' }, aheadEl, behindEl), outEl, camBtn,
    h('div', { class: 'tr3-dash' },
      h('div', { class: 'tr3-coal' }, lumps, h('span', {}, 'COAL × ', coalEl)),
      gauge,
      h('div', { class: 'tr3-plate' }, kmEl, stateEl)));
  const world = W.createWorld(T, canvas, {});
  const ctl = controls(game.stage, { joystick: true, buttons: [{ id: 'coal', label: '⛏ Get coal', className: 'is-right' }] });
  game.grantText = (g) => `+${g} coal in the tender`;

  const names = new Map();
  let race = {};
  let coal = START_COAL; let fire = 0; let serverM = 0; let myM = 0;
  let yaw = 0; let pitch = 0; let lean = 0; let t = 0; let view = 'cab';
  const lastSide = new Map(); const lanes = new Map(); let outWarned = 0;
  const unsubs = [];
  unsubs.push(live.on(P('players'), (val) => { for (const [u, p] of Object.entries(val || {})) names.set(u, p); preloadBlooks([...names.values()].map((p) => p.blook)); }));
  unsubs.push(live.on(P(`me/${uid}`), (m) => { if (m && m.tr) { coal = m.tr.c; fire = m.tr.f; serverM = m.tr.m; } }));
  unsubs.push(live.on(P('race'), (r) => {
    race = r || {};
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      const side = Math.sign(d - myM); const was = lastSide.get(u); const who = names.get(u)?.name || 'Someone';
      if (was === -1 && side === 1) game.flash(`${who} passed you!`, 'is-bad');
      if (was === 1 && side === -1) { game.flash(`You passed ${who}!`, 'is-ok'); sfx('coin'); }
      if (side) lastSide.set(u, side);
    }
    const near = Object.entries(race).filter(([u]) => u !== uid).sort((a, b) => Math.abs(a[1] - myM) - Math.abs(b[1] - myM)).slice(0, 4).map(([u]) => u);
    for (const u of [...lanes.keys()]) if (!near.includes(u)) { lanes.delete(u); world.removeTrain(u); }
    for (const u of near) {
      if (lanes.has(u)) continue;
      const free = [-1, 1, -2, 2].find((l) => ![...lanes.values()].includes(l));
      if (free !== undefined) lanes.set(u, free);
    }
  }));
  const getCoal = async () => { if (!game.asking) await game.ask({ title: 'Answer right for 2 coal' }); };
  const toggleView = () => { view = view === 'cab' ? 'chase' : 'cab'; };
  camBtn.addEventListener('click', toggleView);
  const keys = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'KeyC' || e.code === 'KeyE' || e.code === 'KeyQ') { e.preventDefault(); getCoal(); }
    if (e.code === 'KeyV') toggleView();
  };
  window.addEventListener('keydown', keys);
  const burning = () => fire > 0 || coal > 0;
  const me = world.trainFor(uid, 0x8a1f1f);
  const look = new T.Vector3(); const camPos = new T.Vector3();
  let shownText = '';
  const stop = loop((dt) => {
    t += dt;
    ctl.update();
    if (!game.asking) {
      if (ctl.tapped('coal')) getCoal();
      if (ctl.tapped('action')) sfx('whistle');
    } else ctl.clear();
    // arrows / WASD / the stick: look left and right, lean out (up), look back (down)
    yaw = lerp(yaw, ctl.x * 1.15 + (ctl.y > 0.3 ? Math.PI * 0.92 * Math.sign(ctl.x || 1) : 0), 0.07);
    lean = lerp(lean, Math.max(0, -ctl.y), 0.07);
    pitch = lerp(pitch, 0, 0.1);
    const e = { coal, fire, m: myM }; burn(e, dt); coal = e.coal; fire = e.fire; myM = e.m;
    myM += (serverM - myM) * Math.min(1, dt * 1.5);
    if (Math.abs(serverM - myM) > METRES_PER_COAL * 1.5) myM = serverM;
    if (!burning() && t > outWarned) { outWarned = t + 5; game.flash('Out of coal! Answer to keep moving', 'is-bad'); }
    game.setMeter('Coal', Math.min(1, (coal + fire / BURN_SECONDS) / 10), `${coal}`);
  }, () => {
    const moving = burning();
    const units = myM / W.M_PER_UNIT;
    world.placeTrain(me, units, 0, moving, 1 / 60, { showLabel: false });
    for (const [u, l] of lanes) {
      const d = race[u]; if (d === undefined) continue;
      const tr = world.trainFor(u, [0x1f4e8a, 0x1f7a4a, 0x6b3fa0, 0xa0601f, 0x2a2a2e, 0x8a1f6b][hashString(u) % 6]);
      const info = names.get(u);
      const dm = d - myM;
      tr.g.visible = Math.abs(dm / W.M_PER_UNIT) < 700;
      world.placeTrain(tr, d / W.M_PER_UNIT, l, true, 1 / 60, { text: info ? `${info.name} · ${dm >= 0 ? '+' : ''}${km(dm)}` : '', colour: dm > 0 ? '#e8112d' : '#12a98a' });
    }
    // the camera: in the cab looking out, or behind the train
    const g = me.g; g.updateMatrixWorld();
    const rumble = moving ? Math.sin(t * 31) * 0.012 + Math.sin(t * 13) * 0.01 : 0;
    if (view === 'cab') {
      camPos.set(0.9 + lean * 1.0, 3.6 + rumble, 2.3).applyMatrix4(g.matrixWorld);
      const dir = new T.Vector3(-Math.sin(yaw), -0.09 + pitch, -Math.cos(yaw)).applyQuaternion(g.quaternion);
      look.copy(camPos).add(dir);
      world.cam.fov = 66; world.cam.near = 0.08;
    } else {
      camPos.set(7 + Math.sin(yaw) * 10, 6.5, 22).applyMatrix4(g.matrixWorld);
      look.set(0, 2.5, -8).applyMatrix4(g.matrixWorld);
      world.cam.fov = 50; world.cam.near = 0.5;
    }
    world.cam.updateProjectionMatrix();
    world.cam.position.copy(camPos); world.cam.lookAt(look);
    world.render(1 / 60, g.position);
    // the dashboard
    const text = `${coal}|${Math.floor(myM / 100)}|${moving}`;
    if (text !== shownText) {
      shownText = text;
      coalEl.textContent = String(coal);
      fill(lumps, ...Array.from({ length: Math.min(12, coal) }, (_, i) => h('i', { style: { animationDelay: `${i * 40}ms` } })));
      kmEl.textContent = km(myM);
      stateEl.textContent = moving ? 'FULL STEAM' : 'STOPPED · NEED COAL';
      outEl.hidden = moving;
    }
    gauge.style.setProperty('--a', `${-120 + Math.min(1, fire / BURN_SECONDS * 0.55 + (coal > 0 ? 0.4 : 0)) * 240 + (moving ? Math.sin(t * 20) * 2 : 0)}deg`);
    let ahead = null; let behind = null;
    for (const [u, d] of Object.entries(race)) {
      if (u === uid) continue;
      if (d > myM && (!ahead || d < ahead[1])) ahead = [u, d];
      if (d <= myM && (!behind || d > behind[1])) behind = [u, d];
    }
    aheadEl.hidden = !ahead; behindEl.hidden = !behind;
    if (ahead) aheadEl.textContent = `▲ ${names.get(ahead[0])?.name || '?'} · ${km(ahead[1] - myM)} ahead`;
    if (behind) behindEl.textContent = `▼ ${names.get(behind[0])?.name || '?'} · ${km(myM - behind[1])} behind`;
  });
  return () => { stop(); ctl.destroy(); world.destroy(); unsubs.forEach((u) => u()); window.removeEventListener('keydown', keys); };
}

const BODY3 = [0x8a1f1f, 0x1f4e8a, 0x1f7a4a, 0x6b3fa0, 0xa0601f, 0x2a2a2e, 0x8a1f6b, 0x1f7a7a];

function mountScreen3D(holder, { ref }, W, T) {
  const canvas = h('canvas', { class: 'tr3-canvas' });
  const rec = h('div', { class: 'tr3-rec' });
  const board = h('div', { class: 'tr3-board' });
  fill(holder, canvas, h('div', { class: 'tr3-bars' }), rec, board);
  const world = W.createWorld(T, canvas, { tv: true });
  const lanesOf = [0, -1, 1, -2, 2];
  const shown = new Map();
  let t = 0; let shot = 0; let shotT = 0; let last = performance.now(); let boardText = '';
  const SHOTS = ['CAM 1 · TRACKSIDE', 'CAM 2 · DRONE', 'CAM 3 · AHEAD OF THE LEADER', 'CAM 4 · CHASE'];
  const camPos = new T.Vector3(); const look = new T.Vector3(); const smoothPos = new T.Vector3(); let first = true;
  const stop = loop(() => {}, () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t += dt; shotT += dt;
    if (shotT > 8) { shotT = 0; shot = (shot + 1) % SHOTS.length; first = true; }
    const list = ref.ranked().slice(0, 5);
    const leader = list[0];
    const ids = new Set(list.map((p) => p.uid));
    for (const id of [...world.trains.keys()]) if (!ids.has(id)) world.removeTrain(id);
    list.forEach((p, i) => {
      const m = p.extra.m ?? p.score;
      const sm = lerp(shown.get(p.uid) ?? m, m, Math.min(1, dt * 1.2)); shown.set(p.uid, sm);
      const tr = world.trainFor(p.uid, BODY3[hashString(p.uid) % BODY3.length]);
      const moving = (p.extra.fire || 0) > 0 || (p.extra.coal || 0) > 0;
      world.placeTrain(tr, sm / W.M_PER_UNIT, lanesOf[i], moving, dt, { text: `${i + 1}. ${p.name} · ${km(sm)}`, colour: i === 0 ? '#ffcd1f' : 'rgba(23,19,63,.88)' });
    });
    const lt = leader && world.trains.get(leader.uid);
    const g = lt ? lt.g : null;
    if (g) {
      g.updateMatrixWorld();
      const offs = [[26, 5, 4, 0, 2, -4], [-36, 34, 46, 0, 0, -20], [7, 1.6, -42, 0, 3, 0], [9, 8, 30, 0, 2.5, -10]][shot];
      camPos.set(offs[0], offs[1], offs[2]).applyMatrix4(g.matrixWorld);
      look.set(offs[3], offs[4], offs[5]).applyMatrix4(g.matrixWorld);
      if (first) { smoothPos.copy(camPos); first = false; } else smoothPos.lerp(camPos, Math.min(1, dt * 3));
      world.cam.position.copy(smoothPos); world.cam.lookAt(look);
      world.render(dt, g.position);
    } else {
      world.cam.position.set(curveX(-20) + 18, 6, -20); world.cam.lookAt(curveX(-60), 2, -60);
      world.render(dt, { x: 0, z: 0 });
    }
    rec.innerHTML = `<i class="${Math.floor(t * 1.6) % 2 ? 'off' : ''}"></i> REC · ${SHOTS[shot]}${leader ? ` · FOLLOWING THE LEADER: <b>${escapeHtml(leader.name)}</b> · ${km(leader.extra.m ?? leader.score)}` : ' · WAITING AT THE STATION'}`;
    const bt = list.map((p) => `${p.uid}${Math.floor((p.extra.m ?? p.score) / 100)}`).join('|');
    if (bt !== boardText) {
      boardText = bt;
      fill(board, h('h3', {}, 'Farthest trains'), ...list.map((p, i) => h('div', { class: `tr3-row${i === 0 ? ' is-first' : ''}` },
        h('b', {}, String(i + 1)), blook(p.blook, 28), h('span', { class: 'grow' }, p.name), h('b', {}, km(p.extra.m ?? p.score)))));
    }
  });
  return () => { stop(); world.destroy(); };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
