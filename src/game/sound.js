// sound.js — every sound Quickzy makes, played live with WebAudio.
//
// There are no audio files: each sound is built from small instruments (a
// marimba, bells, a plucked string, a soft electric piano, warm pads, real
// drum-machine drums) played through a room reverb and a gentle compressor.
// Notes are never quite the same twice: timing and loudness wander a little,
// the way a person plays.
//
// Respects the Sound and Music switches in Settings, and stays silent until
// the page has been touched (the browser's rule).

import { prefs } from '../services/session.js';

let ctx = null;
let master = null;   // everything ends here
let fx = null;       // sound effects
let room = null;     // reverb send

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    // a soft top end, so nothing is harsh on phone speakers
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 7000; shelf.gain.value = -4;
    master = ctx.createGain(); master.gain.value = 0.62;
    master.connect(shelf).connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 1.9, 2.6);
    room = ctx.createGain(); room.gain.value = 0.32;
    room.connect(verb).connect(master);
    fx = ctx.createGain(); fx.gain.value = 1; fx.connect(master);
    bakeKit();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** A stereo room: decaying noise that gets darker as it fades. */
function impulse(c, secs, decay) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const a = 0.9 - k * 0.75; // darker over time
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * (1 - k) ** decay * (i < 400 ? i / 400 : 1) * 2.2;
    }
  }
  return buf;
}

// unlock on the first touch or key
if (typeof window !== 'undefined') ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio(), { once: true, passive: true }));

const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const now = () => ctx.currentTime;

/** A gain node with a natural (exponential-ish) envelope. */
function env(t, { a = 0.005, peak = 0.3, d = 0.3, s = 0, hold = 0, r = 0.2 }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (s > 0) {
    g.gain.setTargetAtTime(peak * s, t + a, d / 3);
    g.gain.setTargetAtTime(0, t + a + hold, r / 3);
  } else g.gain.setTargetAtTime(0, t + a, d / 3);
  return g;
}
const end = (t, { a = 0.005, d = 0.3, hold = 0, r = 0.2, s = 0 }) => t + a + (s > 0 ? hold + r * 2.5 : d * 2.5) + 0.05;

function osc(type, freq, t, stop) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  o.start(t); o.stop(stop);
  return o;
}
function send(node, out, wet) {
  node.connect(out);
  if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w).connect(room); }
}

let noiseBuf = null;
function noiseSrc(t, stop) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.start(t, Math.random() * 1.5); s.stop(stop);
  return s;
}
function filter(type, freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

/* ------------------------------------------------------------ instruments */

/**
 * FM synthesis: one sine bends another. With the right ratios it makes a
 * marimba, a bell, a woodblock or an electric piano.
 */
function fm(freq, t, { ratio = 1, index = 2, idecay = 0.2, a = 0.003, d = 0.5, s = 0, hold = 0, r = 0.3, gain = 0.2, out = fx, wet = 0.2, type = 'sine' } = {}) {
  const stop = end(t, { a, d, hold, r, s });
  const car = osc(type, freq, t, stop);
  const mod = osc('sine', freq * ratio, t, stop);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(freq * index, t);
  mg.gain.setTargetAtTime(freq * index * 0.08, t, idecay / 3);
  mod.connect(mg).connect(car.frequency);
  const g = env(t, { a, peak: gain, d, s, hold, r });
  car.connect(g); send(g, out, wet);
  return car;
}

const INST = {
  marimba: (f, t, v = 1, o = {}) => { fm(f, t, { ratio: 4, index: 1.6, idecay: 0.05, d: 0.42, gain: 0.22 * v, ...o }); fm(f, t, { ratio: 1, index: 0.3, idecay: 0.2, d: 0.5, gain: 0.12 * v, ...o }); },
  bell: (f, t, v = 1, o = {}) => { fm(f, t, { ratio: 3.5, index: 2.2, idecay: 0.6, d: 1.6, gain: 0.12 * v, wet: 0.45, ...o }); fm(f * 2, t, { ratio: 1.41, index: 1, idecay: 0.3, d: 0.9, gain: 0.05 * v, wet: 0.45, ...o }); },
  glock: (f, t, v = 1, o = {}) => { fm(f, t, { ratio: 3.01, index: 0.9, idecay: 0.05, d: 0.9, gain: 0.13 * v, wet: 0.4, ...o }); },
  wood: (f, t, v = 1, o = {}) => fm(f, t, { ratio: 2.71, index: 3, idecay: 0.02, d: 0.06, gain: 0.2 * v, wet: 0.12, ...o }),
  epiano: (f, t, v = 1, o = {}) => {
    fm(f, t, { ratio: 1, index: 1.4 * v, idecay: 0.5, a: 0.004, d: 1.4, gain: 0.13 * v, wet: 0.3, ...o });
    if (!o.lite) fm(f, t, { ratio: 14, index: 0.6, idecay: 0.03, d: 0.15, gain: 0.03 * v, wet: 0.3, ...o }); // the tine
  },
  pluck: (f, t, v = 1, o = {}) => pluck(f, t, { gain: 0.32 * v, ...o }),
  flute: (f, t, v = 1, { dur = 0.3, out = fx, wet = 0.35 } = {}) => {
    const stop = t + dur + 0.6;
    const o1 = osc('sine', f, t, stop); const o2 = osc('triangle', f * 2, t, stop);
    const vib = osc('sine', 5.2, t, stop); const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
    vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
    const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2);
    const breath = noiseSrc(t, stop); const bf = filter('bandpass', f * 2, 3); const bg = ctx.createGain(); bg.gain.value = 0.25;
    breath.connect(bf).connect(bg);
    const g = env(t, { a: 0.06, peak: 0.11 * v, s: 0.8, d: 0.2, hold: dur, r: 0.18 });
    o1.connect(g); g2.connect(g); bg.connect(g); send(g, out, wet);
  },
};

// plucked strings (Karplus–Strong), worked out once per note and kept
const strings = new Map();
function pluck(freq, t, { gain = 0.3, bright = 0.5, out = fx, wet = 0.25, secs = 1.4 } = {}) {
  const key = `${Math.round(freq)}:${bright}`;
  let buf = strings.get(key);
  if (!buf) {
    const sr = ctx.sampleRate; const n = Math.floor(sr * secs);
    buf = ctx.createBuffer(1, n, sr); const d = buf.getChannelData(0);
    const p = Math.max(2, Math.round(sr / freq)); const line = new Float32Array(p);
    for (let i = 0; i < p; i++) line[i] = (Math.random() * 2 - 1) * (0.6 + bright * 0.4);
    const damp = 0.997; const keep = bright * 0.5;
    for (let i = 0; i < n; i++) {
      const j = i % p; const cur = line[j]; const nxt = line[(j + 1) % p];
      d[i] = cur;
      line[j] = damp * (keep * cur + (1 - keep) * 0.5 * (cur + nxt));
    }
    strings.set(key, buf);
  }
  const s = ctx.createBufferSource(); s.buffer = buf;
  s.playbackRate.value = 1 + rnd(-0.002, 0.002);
  const g = ctx.createGain(); g.gain.value = gain;
  const lp = filter('lowpass', 1800 + bright * 5000);
  s.connect(lp).connect(g); send(g, out, wet);
  s.start(t);
}

/** Warm pad: detuned saws, a slow filter, a long fade. */
function pad(notes, t, dur, { gain = 0.03, out, cutoff = 1100 } = {}) {
  const stop = t + dur + 1.6;
  const lp = filter('lowpass', cutoff * 0.5, 0.4);
  lp.frequency.setValueAtTime(cutoff * 0.4, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur);
  const g = env(t, { a: 0.35, peak: gain, s: 0.9, d: 0.5, hold: dur, r: 1 });
  notes.forEach((n, k) => { const o = osc('sawtooth', midi(n), t, stop); o.detune.value = (k % 2 ? 7 : -7) + rnd(-2, 2); o.connect(lp); });
  const sub = osc('sine', midi(notes[0] - 12), t, stop); const sg = ctx.createGain(); sg.gain.value = 1.5; sub.connect(sg).connect(lp);
  lp.connect(g); send(g, out, 0.5);
}

/** Round bass: a sine for weight, a filtered saw for the pluck. */
function bassNote(n, t, dur, { gain = 0.2, out } = {}) {
  const f = midi(n); const stop = t + dur + 0.4;
  const s1 = osc('sine', f, t, stop); const s2 = osc('sawtooth', f, t, stop);
  const lp = filter('lowpass', 900, 2); lp.frequency.setValueAtTime(1100, t); lp.frequency.setTargetAtTime(240, t, 0.06);
  const g2 = ctx.createGain(); g2.gain.value = 0.35; s2.connect(lp).connect(g2);
  const g = env(t, { a: 0.006, peak: gain, s: 0.7, d: 0.12, hold: dur * 0.8, r: 0.08 });
  s1.connect(g); g2.connect(g); g.connect(out);
}

/* ----------------------------------------------------------------- drums */

function kick(t, out, v = 1) {
  const o = osc('sine', 150, t, t + 0.5);
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  const g = env(t, { a: 0.002, peak: 0.7 * v, d: 0.32 });
  o.connect(g).connect(out);
  const n = noiseSrc(t, t + 0.03); const hp = filter('highpass', 3000); const cg = env(t, { a: 0.001, peak: 0.08 * v, d: 0.008 });
  n.connect(hp).connect(cg).connect(out);
}
function snare(t, out, v = 1) {
  const n = noiseSrc(t, t + 0.4); const bp = filter('bandpass', 3200, 0.8); const hp = filter('highpass', 900);
  const g = env(t, { a: 0.001, peak: 0.24 * v, d: 0.16 });
  n.connect(hp).connect(bp).connect(g); send(g, out, 0.25);
  const b = osc('triangle', 190, t, t + 0.2); b.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const bg = env(t, { a: 0.001, peak: 0.2 * v, d: 0.06 }); b.connect(bg).connect(out);
}
function clap(t, out, v = 1) {
  const n = noiseSrc(t, t + 0.5); const bp = filter('bandpass', rnd(1100, 1500), 1.4);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  [0, 0.011, 0.022].forEach((dt) => { g.gain.setValueAtTime(0.32 * v, t + dt); g.gain.setTargetAtTime(0.02, t + dt + 0.001, 0.003); });
  g.gain.setValueAtTime(0.26 * v, t + 0.031); g.gain.setTargetAtTime(0, t + 0.032, 0.05);
  n.connect(bp).connect(g); send(g, out, 0.4);
}
// a real drum-machine hi-hat: six square waves at clangy ratios
const HAT = [2, 3, 4.16, 5.43, 6.79, 8.21];
function hat(t, out, v = 1, open = false) {
  const stop = t + (open ? 0.5 : 0.12);
  const bp = filter('bandpass', 10000, 0.8); const hp = filter('highpass', 7000);
  const g = env(t, { a: 0.001, peak: 0.12 * v, d: open ? 0.22 : 0.035 });
  for (const r of HAT) osc('square', 40 * r, t, stop).connect(bp);
  bp.connect(hp).connect(g); send(g, out, 0.1);
}
function shaker(t, out, v = 1) {
  const n = noiseSrc(t, t + 0.15); const hp = filter('highpass', 6500);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.025); g.gain.setTargetAtTime(0, t + 0.03, 0.02);
  n.connect(hp).connect(g).connect(out);
}
function cymbal(t, out, v = 1, secs = 1.6) {
  const n = noiseSrc(t, t + secs + 0.5); const hp = filter('highpass', 5500); const g = env(t, { a: 0.002, peak: 0.12 * v, d: secs });
  n.connect(hp).connect(g); send(g, out, 0.5);
  hat(t, out, v * 0.6, true);
}

// Drums are worked out once into little recordings, then played back: it
// sounds the same and costs a phone far less than building every hit live.
const baked = {};
const KIT = {
  kick: [0.5, (t, o) => kick(t, o)],
  snare: [0.45, (t, o) => snare(t, o)],
  clap: [0.4, (t, o) => clap(t, o)],
  hat: [0.15, (t, o) => hat(t, o)],
  openhat: [0.6, (t, o) => hat(t, o, 1, true)],
  shaker: [0.18, (t, o) => shaker(t, o)],
  crash: [2.2, (t, o) => cymbal(t, o, 1, 1.6)],
};
/** Record a sound once, in the background; later calls play the recording. */
function bake(key, secs, draw) {
  if (key in baked || typeof OfflineAudioContext === 'undefined') return;
  const real = ctx; const realRoom = room;
  baked[key] = null;
  try {
    const off = new OfflineAudioContext(1, Math.ceil(real.sampleRate * secs), real.sampleRate);
    ctx = off; room = off.createGain();
    draw(0, off.destination);
    off.startRendering().then((b) => { baked[key] = b; }).catch(() => {});
  } catch { /* play live instead */ } finally { ctx = real; room = realRoom; }
}
function bakeKit() { for (const [name, [secs, draw]] of Object.entries(KIT)) bake(name, secs, draw); }
function playBuf(b, t, out, v, wet = 0) {
  const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = 1 + rnd(-0.0015, 0.0015);
  const g = ctx.createGain(); g.gain.value = v;
  s.connect(g); send(g, out, wet); s.start(Math.max(t, ctx.currentTime));
}
const NOTE_SECS = { marimba: 1.3, bell: 2.5, glock: 1.6, epiano: 2.2, pluck: 1.4, flute: 0.9, bass: 0.6 };
/** One note of the music: a recording of that instrument and note once it's ready. */
function note(inst, n, t, out, v = 1, live = {}) {
  const key = `${inst}:${n}`;
  const b = baked[key];
  if (b) { playBuf(b, t, out, v); return; }
  if (!(key in baked)) bake(key, NOTE_SECS[inst] || 1, (t0, o) => (inst === 'bass' ? bassNote(n, t0, 0.22, { out: o }) : INST[inst](midi(n), t0, 1, { out: o, wet: 0, lite: true, bright: 0.45, dur: 0.3 })));
  if (inst === 'bass') bassNote(n, t, 0.22, { out, gain: 0.2 * v }); else INST[inst](midi(n), t, v, { out, wet: 0, lite: true, bright: 0.45, dur: 0.3, ...live });
}

/** Play a drum: the recording when it's ready, otherwise build it live. */
function drum(name, t, out, v = 1, wet = 0) {
  const b = baked[name];
  if (!b) { KIT[name][1](t, out); return; }
  playBuf(b, t, out, v, wet);
}

/* ----------------------------------------------------------- the effects */

/** A pitch sweep with an envelope — the base of whooshes and zaps. */
function sweep(type, f0, f1, t, dur, { gain = 0.15, out = fx, wet = 0.15, lp = 0 } = {}) {
  const o = osc(type, f0, t, t + dur + 0.3);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = env(t, { a: 0.004, peak: gain, d: dur * 0.6 });
  if (lp) { const f = filter('lowpass', lp); o.connect(f).connect(g); } else o.connect(g);
  send(g, out, wet);
  return o;
}
function whoosh(t, dur, { from = 300, to = 3200, gain = 0.2, q = 1.2, out = fx, wet = 0.3 } = {}) {
  const n = noiseSrc(t, t + dur + 0.3); const bp = filter('bandpass', from, q);
  bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.7); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
  n.connect(bp).connect(g); send(g, out, wet);
}
function thud(t, { f = 90, gain = 0.35, cut = 700, d = 0.18 } = {}) {
  const o = osc('sine', f * 1.6, t, t + d * 3); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
  const g = env(t, { a: 0.002, peak: gain, d }); o.connect(g).connect(fx);
  const n = noiseSrc(t, t + d * 2); const lp = filter('lowpass', cut); const ng = env(t, { a: 0.001, peak: gain * 0.6, d: d * 0.5 });
  n.connect(lp).connect(ng); send(ng, fx, 0.12);
}
/** A brass-like chord: saws that open up as they're blown. */
function brass(notes, t, dur, gain = 0.06) {
  const stop = t + dur + 0.6;
  const lp = filter('lowpass', 400, 1.5); lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.08); lp.frequency.setTargetAtTime(1500, t + 0.1, 0.2);
  for (const n of notes) for (const det of [-6, 5]) { const o = osc('sawtooth', midi(n), t, stop); o.detune.value = det + rnd(-3, 3); o.connect(lp); }
  const g = env(t, { a: 0.03, peak: gain, s: 0.75, d: 0.15, hold: dur, r: 0.25 });
  lp.connect(g); send(g, fx, 0.45);
}

const human = (t) => t + rnd(0, 0.008);
const play = (name, notes, step, v = 1, opts) => { const t0 = audio() && now(); notes.forEach((n, i) => { if (n != null) INST[name](midi(n), human(t0 + i * step), v * rnd(0.85, 1), opts); }); };

const SOUNDS = {
  // menus: a soft wooden tick, not a beep
  pick: () => { const t = now(); INST.wood(midi(84 + Math.floor(rnd(0, 3))), t, 1.6); INST.glock(midi(96), t, 0.5); },
  tap: () => { const t = now(); INST.wood(midi(88), t, 1.1); },
  // a friend arrives: a little two-note "hello" on the marimba and a sparkle
  join: () => { play('marimba', [79, 84], 0.085, 0.9); const t = now(); INST.glock(midi(96), t + 0.17, 0.4); },
  // right answer: a warm rising chord, the top note rings out
  right: () => { play('marimba', [72, 76, 79], 0.06, 1); const t = now(); INST.bell(midi(84), t + 0.18, 0.9); INST.glock(midi(91), t + 0.2, 0.4); },
  // wrong answer: a gentle, low "uh-oh", nothing harsh
  wrong: () => { const t = now(); fm(midi(58), t, { ratio: 1, index: 1.2, idecay: 0.08, d: 0.22, gain: 0.2, wet: 0.15 }); fm(midi(53), t + 0.17, { ratio: 1, index: 1, idecay: 0.1, d: 0.38, gain: 0.22, wet: 0.2 }); },
  tick: () => INST.wood(midi(96), now(), 1),
  countdown: () => { const t = now(); INST.wood(midi(81), t, 1.6); INST.marimba(midi(69), t, 1); },
  go: () => { const t = now(); [60, 64, 67, 72].forEach((n) => INST.pluck(midi(n), human(t), 0.7, { bright: 0.8 })); brass([60, 67, 72, 76], t, 0.35, 0.05); cymbal(t, fx, 0.6, 1.2); kick(t, fx, 0.8); },
  // the answer comes up: a quick harp run
  reveal: () => play('pluck', [67, 72, 76, 79, 84], 0.045, 0.8, { bright: 0.7 }),
  laser: () => { const t = now(); sweep('sine', 2600, 260, t, 0.17, { gain: 0.4, wet: 0.25 }); sweep('square', 1300, 130, t, 0.12, { gain: 0.08, lp: 2500 }); whoosh(t, 0.05, { from: 4000, to: 1200, gain: 0.15 }); },
  tagged: () => { const t = now(); thud(t, { f: 70, gain: 0.4, cut: 1200 }); sweep('sawtooth', 900, 120, t, 0.3, { gain: 0.05, lp: 1400, wet: 0.3 }); },
  // a springy "boing"
  jump: () => { const t = now(); const o = sweep('sine', 300, 760, t, 0.16, { gain: 0.4, wet: 0.1 }); const l = osc('sine', 28, t, t + 0.4); const lg = ctx.createGain(); lg.gain.value = 30; l.connect(lg).connect(o.frequency); },
  land: () => thud(now(), { f: 80, gain: 0.5, cut: 500, d: 0.08 }),
  bump: () => { const t = now(); thud(t, { f: 60, gain: 0.4, cut: 900 }); INST.wood(midi(50), t + 0.01, 0.8); },
  boost: () => { const t = now(); whoosh(t, 0.45, { from: 250, to: 4000, gain: 0.45 }); sweep('sine', 180, 700, t, 0.45, { gain: 0.08, wet: 0.3 }); },
  shoot: () => { const t = now(); sweep('sine', 1800, 300, t, 0.09, { gain: 0.3, wet: 0.15 }); },
  boom: () => {
    const t = now();
    const n = noiseSrc(t, t + 2); const lp = filter('lowpass', 2400, 0.8); lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(140, t + 1.1);
    const g = env(t, { a: 0.003, peak: 0.45, d: 0.8 }); n.connect(lp).connect(g); send(g, fx, 0.45);
    const s = osc('sine', 75, t, t + 1.2); s.frequency.exponentialRampToValueAtTime(32, t + 0.8); const sg = env(t, { a: 0.003, peak: 0.5, d: 0.5 }); s.connect(sg).connect(fx);
  },
  coin: () => { const t = now(); INST.bell(midi(83), t, 0.7, { d: 0.3 }); INST.bell(midi(88), t + 0.075, 0.9, { d: 1 }); },
  checkpoint: () => play('bell', [79, 83, 86, 91], 0.075, 0.8),
  // a slide whistle going down
  fall: () => { const t = now(); const o = sweep('sine', 1100, 260, t, 0.65, { gain: 0.3, wet: 0.25 }); const l = osc('sine', 7, t, t + 1); const lg = ctx.createGain(); lg.gain.value = 18; l.connect(lg).connect(o.frequency); },
  // a short fanfare: brass, timpani, cymbal and a harp run
  win: () => {
    const t = now();
    [[0, [60, 64, 67], 0.16], [0.18, [60, 64, 67], 0.1], [0.32, [65, 69, 72], 0.16], [0.52, [67, 71, 74], 0.22], [0.8, [72, 76, 79, 84], 1.1]].forEach(([at, ch, d]) => brass(ch, t + at, d, 0.045));
    [0, 0.32, 0.52].forEach((at) => thud(t + at, { f: 65, gain: 0.25, cut: 400, d: 0.25 }));
    kick(t + 0.8, fx, 0.9); cymbal(t + 0.8, fx, 0.9, 2);
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => INST.pluck(midi(n), t + 0.82 + i * 0.05, 0.6, { bright: 0.8 }));
    INST.bell(midi(96), t + 1.2, 0.6);
  },
  drum: () => { const t = now(); thud(t, { f: 72, gain: 0.35, cut: 600, d: 0.3 }); },
  // a steam train's whistle: three detuned pipes and a puff of steam
  whistle: () => {
    const t = now(); const dur = 0.9;
    [523, 659, 784].forEach((f) => { const o = osc('sawtooth', f * 0.97, t, t + dur + 0.5); o.frequency.linearRampToValueAtTime(f, t + 0.12); const lp = filter('lowpass', 1800, 1); const g = env(t, { a: 0.08, peak: 0.035, s: 0.85, d: 0.2, hold: dur, r: 0.2 }); o.connect(lp).connect(g); send(g, fx, 0.5); });
    whoosh(t, dur, { from: 2000, to: 2600, gain: 0.08, q: 0.6 });
  },
  // a room full of people: real-sounding claps over a murmur, rising then fading
  applause: () => {
    const t = now(); const secs = 3.4;
    for (let i = 0; i < 160; i++) { const k = Math.random(); const at = k * secs; if (Math.random() > Math.sin(Math.PI * Math.min(1, k * 1.4)) + 0.15) continue; clap(t + at, fx, rnd(0.25, 0.7)); }
    const n = noiseSrc(t, t + secs + 1); const bp = filter('bandpass', 900, 0.5); const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0, t + secs);
    n.connect(bp).connect(g); send(g, fx, 0.5);
    // someone whistles
    const w = t + rnd(0.5, 1); sweep('sine', 1700, 2500, w, 0.25, { gain: 0.05, wet: 0.4 }); sweep('sine', 1700, 2800, w + 0.35, 0.3, { gain: 0.05, wet: 0.4 });
  },
};

// a little buzz on phones for the moments that matter (Android; iPhones ignore it)
const BUZZ = { right: 35, wrong: [60, 50, 60], win: [30, 40, 30, 40, 90], boom: 70, tagged: [40, 30, 40], checkpoint: 25 };

export function sfx(name) {
  if (BUZZ[name] && prefs().vibrate !== false && typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(BUZZ[name]); } catch { /* not allowed yet */ } }
  if (!prefs().sound) return;
  const fn = SOUNDS[name];
  if (fn && audio()) { try { fn(); } catch { /* audio not available */ } }
}

/* ------------------------------------------------------------------ music */

// Little songs, played by a scheduler that looks a little ahead so nothing
// stutters. Each has drums, a bass line, a pad on the chords, a rhythm part
// and a melody on a real-sounding instrument, with an A part and a B part.
//
// Drum letters: x = hit, o = soft hit, . = rest.
// Chords are MIDI notes above the key. Melody arrays hold notes above the key
// (null = rest), one per sixteenth note.

const N = null;
const TRACKS = {
  // calm and warm: home, menus, the intro
  menu: {
    bpm: 92, key: 60, swing: 0.14,
    chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]],
    kick: 'x.........x.....', snare: '....x.......x...', hat: '..o...o...o...o.', shake: 'xoxoxoxoxoxoxoxo', clap: true,
    bass: [0, N, N, N, N, N, 7, N, 0, N, N, 12, N, N, 7, N],
    comp: 'epiano', compPat: '..x...x...x..x..',
    lead: 'marimba',
    leadA: [12, N, N, 16, N, N, 19, N, 16, N, 14, N, 12, N, N, N],
    leadB: [19, N, 21, N, 19, N, 16, N, 14, N, 16, N, 11, N, N, N],
  },
  // the lobby: funky, waiting for friends
  lobby: {
    bpm: 104, key: 62, swing: 0.18,
    chords: [[0, 3, 7, 10], [5, 9, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]],
    kick: 'x..x....x.x.....', snare: '....x.......x..o', hat: 'xoxox.xoxoxox.xo', shake: '', clap: true,
    bass: [0, N, 0, 12, N, 0, 10, N, 0, N, 0, 12, N, 7, 10, N],
    comp: 'epiano', compPat: '.x..x.x..x..x.x.',
    lead: 'pluck',
    leadA: [12, N, 15, N, 17, 15, N, 12, N, N, 10, N, 12, N, N, N],
    leadB: [19, N, 17, N, 15, N, 17, 19, 22, N, 19, N, 17, 15, 12, N],
  },
  // playing: bright and driving
  game: {
    bpm: 124, key: 64, swing: 0.06,
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.xo', shake: '', clap: true,
    bass: [0, N, 12, 0, N, 12, 0, N, -3, N, 9, -3, N, -5, 7, N],
    comp: 'pluck', compPat: 'x.x.x.x.x.x.x.x.',
    lead: 'marimba',
    leadA: [12, N, 12, 14, 16, N, 12, N, 9, N, 9, 12, 14, N, N, N],
    leadB: [19, N, 16, N, 19, 21, 19, 16, 14, N, 12, N, 14, 16, 12, N],
  },
  // the arcade games: adventurous
  arcade: {
    bpm: 118, key: 57, swing: 0.08,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]],
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xox.xox.xox.xoxo', shake: '', clap: false,
    bass: [0, N, 0, N, 12, N, 0, 3, -4, N, -4, N, 8, N, -4, -2],
    comp: 'pluck', compPat: 'x..x..x.x..x..x.',
    lead: 'flute',
    leadA: [12, N, N, 15, N, N, 19, N, 15, N, 12, N, 10, N, N, N],
    leadB: [24, N, 22, N, 19, N, 15, N, 17, N, 19, N, 15, N, N, N],
  },
  // the last 30 seconds
  tense: {
    bpm: 140, key: 57, swing: 0,
    chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 1, 5]],
    kick: 'x...x...x...x...', snare: '....x.......x.oo', hat: 'xoxoxoxoxoxoxoxo', shake: '', clap: false,
    bass: [0, 0, 12, 0, 0, 12, 0, 0, -4, -4, 8, -4, -2, -2, 10, -2],
    comp: 'pluck', compPat: 'x.xxx.xxx.xxx.xx',
    lead: 'marimba',
    leadA: [12, N, 11, N, 12, N, 15, N, 14, N, 12, N, 11, N, 7, N],
    leadB: [15, 14, 12, 11, 12, N, 15, N, 19, N, 17, 15, 14, N, 11, N],
  },
  // the podium
  victory: {
    bpm: 112, key: 60, swing: 0.05,
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', shake: 'xoxoxoxoxoxoxoxo', clap: true,
    bass: [0, N, 7, N, 0, N, 7, N, 5, N, 12, N, 7, N, 14, N],
    comp: 'pluck', compPat: 'x.x.x.x.x.x.x.x.',
    lead: 'bell',
    leadA: [12, N, 12, N, 12, 16, 19, N, 17, N, 17, 21, 24, N, N, N],
    leadB: [24, N, 23, N, 21, N, 19, N, 17, 19, 21, 19, 24, N, N, N],
  },
};
// old scene names still work
TRACKS.space = TRACKS.arcade;

let music = null;

export function playMusic(scene = 'lobby') {
  if (!prefs().music) { stopMusic(); return; }
  if (music && music.scene === scene) return;
  stopMusic();
  const c = audio();
  if (!c) return;
  const s = TRACKS[scene] || TRACKS.lobby;
  const bus = c.createGain();
  bus.gain.value = 0.0001;
  bus.gain.exponentialRampToValueAtTime(0.42, c.currentTime + 1.5);
  bus.connect(master);
  const busWet = c.createGain(); busWet.gain.value = 0.3; bus.connect(busWet).connect(room);
  const drums = c.createGain(); drums.gain.value = 0.7; drums.connect(bus);
  // a soft echo on the melody makes it feel bigger
  const echo = c.createDelay(); echo.delayTime.value = (60 / s.bpm) * 0.75;
  const fb = c.createGain(); fb.gain.value = 0.25; const eLp = filter('lowpass', 2500);
  const wet = c.createGain(); wet.gain.value = 0.25;
  echo.connect(eLp).connect(fb).connect(echo); eLp.connect(wet).connect(bus);
  const lead = c.createGain(); lead.gain.value = 0.85; lead.connect(bus); lead.connect(echo);
  const six = 60 / s.bpm / 4;
  let step = 0;
  let next = c.currentTime + 0.15;
  const vel = (ch) => (ch === 'x' ? rnd(0.9, 1) : rnd(0.4, 0.55));
  const timer = setInterval(() => {
    if (!prefs().music) { stopMusic(); return; }
    while (next < c.currentTime + 0.5) {
      const i = step % 16;
      const t = next + (i % 2 ? six * s.swing : 0);
      const loose = t + rnd(-0.004, 0.006);  // played by hand, not a grid
      const bar = Math.floor(step / 16);
      const chord = s.chords[bar % s.chords.length];
      const part = Math.floor(bar / 4) % 2 ? s.leadB : s.leadA;
      const fill = bar % 8 === 7 && i >= 12; // a drum fill every eighth bar
      if (s.kick[i] && s.kick[i] !== '.') drum('kick', t, drums, vel(s.kick[i]));
      if (fill) drum('snare', loose, drums, 0.4 + (i - 12) * 0.15);
      else if (s.snare[i] && s.snare[i] !== '.') { drum('snare', loose, drums, vel(s.snare[i])); if (s.clap && s.snare[i] === 'x') drum('clap', loose + 0.004, drums, 0.5); }
      if (s.hat[i] && s.hat[i] !== '.') drum(i === 14 && bar % 2 === 1 ? 'openhat' : 'hat', loose, drums, vel(s.hat[i]) * 0.8);
      if (s.shake && s.shake[i] !== '.') drum('shaker', loose, drums, vel(s.shake[i]));
      if (i === 0 && bar % 8 === 0 && bar > 0) drum('crash', t, drums, 0.5);
      if (s.bass[i] !== null) note('bass', s.key - 24 + s.bass[i] + chord[0], t, bus, rnd(0.85, 1));
      if (i === 0) pad(chord.map((n) => s.key + n - 12), t, six * 15, { out: bus });
      if (s.compPat[i] === 'x') {
        const notes = chord.slice(0, 3).map((n) => s.key + n);
        notes.forEach((n, k) => note(s.comp, n, loose + k * 0.006, bus, 0.35 * rnd(0.8, 1)));
      }
      // the melody rests in the first bar of each part, so the song breathes
      if (part[i] !== null && bar % 8 !== 0) note(s.lead, s.key + part[i], loose, lead, rnd(0.8, 1));
      step += 1;
      next += six;
    }
  }, 100);
  music = { scene, timer, bus };
}

export function stopMusic() {
  if (!music) return;
  clearInterval(music.timer);
  const { bus } = music;
  try {
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    setTimeout(() => bus.disconnect(), 800);
  } catch { /* already gone */ }
  music = null;
}
