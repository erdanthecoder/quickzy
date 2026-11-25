// loader.js — the loading screen: the logo zaps, three blooks hop in turn,
// a bar shimmers, and a tip changes every few seconds so a slow connection
// teaches something instead of just spinning.

import { h } from './dom.js';
import { logo, wordmark } from './icons.js';
import { VERSION } from '../config.js';

export const TIPS = [
  'Faster right answers score more: up to 1000 points, never less than 500.',
  'Three right answers in a row and you are on fire. Streaks add bonus points.',
  'Legendary blooks come out of 1 box in 100. Golden Boxes are luckier.',
  'Reach level 3 to build your first custom blook. You can have three.',
  'Scan the QR code on the big screen to join without typing the PIN.',
  'Every quiz in Discover has a Play solo button. No host needed.',
  'In Laser Tag, grab the glowing pickups for speed boots and rapid fire.',
  'In Robot Run, a shield bubble saves you from one crash.',
  'In Sky Climb, blue crystals give energy and feathers give super jumps.',
  'Sky Climb tip: ice is slippery. Tap gently and stop early.',
  'Hosts can lock the lobby so nobody else joins mid-game.',
  'Publish three quizzes with five or more questions to earn a blue check.',
  'Type-the-answer questions forgive capitals, spaces and accents.',
  'There is a new Quiz of the day on the home page every day.',
  'Duplicate blooks give coins back. Rarer ones give more.',
];

const tipsOn = () => { try { return JSON.parse(localStorage.getItem('quickzy.prefs') || '{}').tips !== false; } catch { return true; } };

/** A tip to start on, different each visit. */
const firstTip = () => Math.floor(Math.random() * TIPS.length);

/** The logo, gently bouncing while things load. */
function drawingMark(size) {
  const el = h('span', { class: 'ld-mark ld-bounce', style: { width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true' }, logo());
  return el;
}

// the boot screen's progress, moved on by main.js as each step finishes
let boot = null;
/** Move the boot screen on: k from 0 to 1, with what is happening now. */
export function bootStep(k, label) {
  if (!boot || !boot.root.isConnected) return;
  boot.target = Math.max(boot.target, k);
  if (label) boot.label.textContent = label;
}

/**
 * loader({ full }) — full is the boot screen; otherwise a small, calm loader
 * inside a page. Returns an element; its timers stop once it leaves the page.
 */
export function loader({ full = false, text = '' } = {}) {
  let i = firstTip();
  const tip = h('p', { class: 'loader-tip' }, TIPS[i]);
  if (!full) {
    const root = h('div', { class: 'loader', role: 'status', 'aria-live': 'polite' },
      drawingMark(46),
      text ? h('p', { class: 'loader-text' }, text) : h('span', { class: 'sr-only' }, 'Loading'),
      h('div', { class: 'loader-tipbox' }, tip));
    rotateTips(root, tip, () => { i = (i + 1) % TIPS.length; return TIPS[i]; });
    return root;
  }
  const label = h('span', { class: 'ld-label' }, 'Starting Quickzy…');
  const fillEl = h('i');
  const pct = h('span', { class: 'ld-pct' }, '0%');
  const root = h('div', { class: 'loader ld-boot', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'ld-glow', 'aria-hidden': 'true' }),
    h('div', { class: 'ld-center' },
      drawingMark(96),
      h('div', { class: 'ld-word' }, wordmark()),
      h('div', { class: 'ld-progress' }, h('div', { class: 'ld-track' }, fillEl), h('div', { class: 'ld-row' }, label, pct))),
    h('div', { class: 'ld-foot' },
      tipsOn() ? h('div', { class: 'ld-tip' }, h('b', {}, 'Did you know?'), tip) : null,
      h('small', {}, `Quickzy ${VERSION}`)));
  // the bar creeps towards the next step, never quite reaching it, like a real download
  boot = { root, label, target: 0.12 };
  let shown = 0;
  const step = () => {
    if (!root.isConnected && root.dataset.seen) { if (boot && boot.root === root) boot = null; return; }
    if (root.isConnected) root.dataset.seen = '1';
    const goal = Math.min(0.97, boot && boot.root === root ? boot.target : shown);
    shown += (goal - shown) * 0.06 + (shown < goal ? 0.0008 : 0);
    fillEl.style.transform = `scaleX(${shown.toFixed(4)})`;
    pct.textContent = `${Math.round(shown * 100)}%`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  rotateTips(root, tip, () => { i = (i + 1) % TIPS.length; return TIPS[i]; });
  return root;
}

function rotateTips(root, tip, next) {
  const timer = setInterval(() => {
    if (!root.isConnected && root.dataset.tipSeen) { clearInterval(timer); return; }
    if (root.isConnected) root.dataset.tipSeen = '1';
    tip.classList.add('is-out');
    setTimeout(() => { tip.textContent = next(); tip.classList.remove('is-out'); }, 280);
  }, 4200);
}
