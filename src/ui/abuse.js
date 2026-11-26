// abuse.js — the owner's "admin abuse": big fun effects that land on
// everyone's screen at once, site-wide or inside one live game.
//
// The owner writes an effect to `abuse` (everyone) or `games/{pin}/abuse`
// (one game). Only the owner's account may write there (database rules).
// Each effect has an id and a time; a screen plays each id once, and only if
// it is fresh, so nobody opening the site later gets old effects.

import { h } from './dom.js';
import { blook, REGULAR } from './blooks.js';
import { confetti, celebrate } from './confetti.js';
import { sfx } from '../game/sound.js';
import { net } from '../net/index.js';

export const EFFECTS = [
  ['message', 'Big message', 'Your words, huge, on every screen'],
  ['confetti', 'Confetti storm', 'Confetti everywhere'],
  ['coins', 'Coin rain', 'Coins fall, and accounts get them for real'],
  ['disco', 'Disco mode', 'Every screen flashes rainbow for 10 seconds'],
  ['blooks', 'Blook stampede', 'A herd of blooks runs across every screen'],
  ['quake', 'Earthquake', 'Every screen shakes'],
  ['fireworks', 'Fireworks show', 'Rockets burst all over every screen'],
  ['giant', 'Giant blook', 'A huge blook rises up and says your caption'],
  ['gravity', 'Gravity fail', 'Everything on the page falls down... and bounces back'],
  ['upside', 'Upside down', 'Every screen flips over for 6 seconds'],
  ['snow', 'Snowstorm', 'A blizzard of snowflakes'],
  ['spin', 'Tornado', 'Every page spins round'],
  ['tiny', 'Shrink ray', 'Everything shrinks to tiny, then pops back'],
];
/** For the owner's "Surprise me" button. */
export const SURPRISES = ['confetti', 'disco', 'blooks', 'quake', 'fireworks', 'giant', 'gravity', 'upside', 'snow', 'spin', 'tiny'];
/** Only inside a live game. */
export const GAME_EFFECTS = [...EFFECTS.filter(([k]) => k !== 'coins'), ['points', 'Bonus points', 'Everyone in the game gets bonus points']];

const FRESH = 60 * 1000;
const seen = new Set();
const calm = () => document.documentElement.dataset.motion === 'calm';

/** Play one effect on this screen. */
export function playEffect(e) {
  if (!e || !e.kind) return;
  const by = h('div', { class: 'abuse-by' }, 'ADMIN ABUSE');
  if (e.kind === 'message') {
    const el = h('div', { class: 'abuse-msg', role: 'alert' }, by, h('b', {}, String(e.text || '').slice(0, 120)));
    document.body.append(el);
    sfx('checkpoint');
    setTimeout(() => el.classList.add('is-out'), 5200);
    setTimeout(() => el.remove(), 5700);
    return;
  }
  if (e.kind === 'points') {
    sfx('checkpoint');
    const el = h('div', { class: 'abuse-msg' }, by, h('b', {}, `+${Number(e.points) || 0} points for everyone!`));
    document.body.append(el);
    if (!calm()) celebrate();
    setTimeout(() => el.classList.add('is-out'), 3500);
    setTimeout(() => el.remove(), 4000);
    return;
  }
  const tag = h('div', { class: 'abuse-tag' }, by, e.text ? h('span', {}, String(e.text).slice(0, 80)) : null);
  document.body.append(tag);
  setTimeout(() => tag.remove(), 4500);
  if (e.kind === 'confetti') {
    sfx('win');
    if (!calm()) { celebrate(); setTimeout(() => celebrate(), 700); setTimeout(() => celebrate(), 1400); }
  }
  if (e.kind === 'coins') {
    sfx('coin');
    if (!calm()) {
      for (let i = 0; i < 50; i++) {
        const c = h('span', { class: 'coin abuse-coin', style: { left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 1.5}s`, animationDuration: `${1.4 + Math.random()}s` } }, 'Q');
        document.body.append(c);
        setTimeout(() => c.remove(), 4200);
      }
    }
  }
  if (e.kind === 'disco') {
    sfx('win');
    document.documentElement.classList.add('abuse-disco');
    setTimeout(() => document.documentElement.classList.remove('abuse-disco'), 10000);
  }
  if (e.kind === 'blooks') {
    sfx('boost');
    if (!calm()) {
      for (let i = 0; i < 24; i++) {
        const id = REGULAR[Math.floor(Math.random() * REGULAR.length)];
        const b = h('div', { class: 'abuse-runner', style: { top: `${8 + Math.random() * 80}%`, animationDelay: `${Math.random() * 2}s`, animationDuration: `${2 + Math.random() * 2}s` } }, blook(id, 56 + Math.random() * 40));
        document.body.append(b);
        setTimeout(() => b.remove(), 6500);
      }
    }
  }
  // the same random pick on every screen, from the effect's id
  const seed = [...String(e.id || 'x')].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const later = (ms, fn) => setTimeout(fn, ms);
  if (e.kind === 'fireworks') {
    sfx('boom');
    if (!calm()) {
      for (let i = 0; i < 7; i++) {
        later(i * 420, () => {
          sfx(i % 2 ? 'boom' : 'checkpoint');
          confetti({ x: 0.15 + ((seed >> i) % 70) / 100, y: 0.25 + ((seed >> (i + 3)) % 30) / 100, count: 90, spread: 360, power: 700, angle: -90 });
        });
      }
    }
  }
  if (e.kind === 'giant') {
    sfx('reveal');
    const id = REGULAR[seed % REGULAR.length];
    const g = h('div', { class: 'abuse-giant' },
      h('div', { class: 'abuse-giant-say' }, String(e.text || 'Hello, everyone!').slice(0, 80)),
      blook(id, 320));
    document.body.append(g);
    later(5200, () => g.classList.add('is-out'));
    later(6000, () => g.remove());
  }
  if (e.kind === 'gravity') {
    sfx('fall');
    if (!calm()) {
      const all = [...document.querySelectorAll('#page h1, #page h2, #page .btn, #page .card, #page img, #page .quiz-card, #page .blook, #page p')].slice(0, 80);
      all.forEach((el, i) => {
        el.style.setProperty('--fall-r', `${((seed >> (i % 20)) % 60) - 30}deg`);
        el.style.animationDelay = `${(i % 12) * 0.05}s`;
        el.classList.add('abuse-fall');
      });
      later(3600, () => all.forEach((el) => { el.classList.remove('abuse-fall'); el.style.animationDelay = ''; }));
    }
  }
  if (e.kind === 'upside') {
    sfx('whistle');
    if (!calm()) { document.documentElement.classList.add('abuse-upside'); later(6000, () => document.documentElement.classList.remove('abuse-upside')); }
  }
  if (e.kind === 'snow') {
    sfx('reveal');
    if (!calm()) {
      for (let i = 0; i < 90; i++) {
        const f = h('span', { class: 'abuse-flake', style: { left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 4}s`, animationDuration: `${3 + Math.random() * 3}s`, fontSize: `${12 + Math.random() * 22}px` } }, '\u2744');
        document.body.append(f);
        later(8000, () => f.remove());
      }
    }
  }
  if (e.kind === 'spin') {
    sfx('boost');
    if (!calm()) { document.body.classList.add('abuse-spin'); later(2200, () => document.body.classList.remove('abuse-spin')); }
  }
  if (e.kind === 'tiny') {
    sfx('pick');
    if (!calm()) { document.body.classList.add('abuse-tiny'); later(3000, () => document.body.classList.remove('abuse-tiny')); }
  }
  if (e.kind === 'quake') {
    sfx('boom');
    if (!calm()) {
      document.body.classList.add('abuse-quake');
      setTimeout(() => document.body.classList.remove('abuse-quake'), 2400);
    }
  }
}

/** Listen at a live path; returns a stop function. onGift(e) runs for fresh coin gifts. */
export function listen(live, path, onGift) {
  return live.on(path, (e) => {
    if (!e || !e.id || seen.has(e.id)) return;
    seen.add(e.id);
    if (typeof e.at !== 'number' || live.now() - e.at > FRESH) return;
    playEffect(e);
    if (onGift && e.kind === 'coins' && e.coins > 0) onGift(e);
  });
}

/** The owner sends an effect: to everyone, or to one game when pin is given. */
export function send(kind, { text = '', coins = 0, points = 0, pin = null } = {}) {
  const e = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, at: net.live.TIMESTAMP };
  if (text) e.text = String(text).slice(0, 120);
  if (coins) e.coins = Math.max(0, Math.min(150, Math.floor(coins)));
  if (points) e.points = Math.max(0, Math.min(5000, Math.floor(points)));
  return net.live.set(pin ? `games/${pin}/abuse` : 'abuse', e);
}
