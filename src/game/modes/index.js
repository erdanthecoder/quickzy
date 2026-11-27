// modes/index.js — the ways a quiz can be played.
//
// "classic" is host-paced, Kahoot-style: one question at a time on the big
// screen. The others are self-paced arcade games: everyone plays at once on
// their own device and answers questions to power up, while the big screen
// shows the race.

import { svg } from '../../ui/dom.js';
import { RELEASE_1_2 } from '../../config.js';

export const MODES = [
  {
    id: 'classic', name: 'Classic', kind: 'paced',
    tagline: 'One question at a time, fastest answers score most.',
    bg: 'linear-gradient(140deg, #6b4cff, #4a2fd6)',
    durations: null,
  },
  {
    id: 'lasertag', name: 'Laser Tag', kind: 'arcade',
    tagline: 'Tag rivals in the arena. Moving and shooting burn energy: answer to recharge.',
    bg: 'linear-gradient(140deg, #0e1a4d, #3a1aa8)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'robotrun', name: 'Robot Run', kind: 'arcade',
    tagline: 'Jump the crates, answer to recharge, outrun everyone.',
    bg: 'linear-gradient(140deg, #ff8a2a, #ff4772)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'obby', name: 'Sky Climb', kind: 'arcade',
    tagline: 'Climb six worlds to the summit. Fall and you drop. Don\'t look down!',
    bg: 'linear-gradient(160deg, #070b26, #3a2380 35%, #7a80b8 55%, #7fdcff 75%, #78cbff)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'train', name: 'Train Travel', kind: 'arcade', isNew: true,
    tagline: 'Answer for coal, keep the fire burning, and travel the farthest!',
    bg: 'linear-gradient(160deg, #3b2a1e, #8a5a2b 45%, #f2a65a)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'skyrace', name: 'Sky Race', kind: 'arcade',
    tagline: 'Fly, answer, BOOST! Outrun the fighter jets before they shoot you down.',
    bg: 'linear-gradient(160deg, #2a6fdb, #7cc2ff 55%, #ffb45c)',
    durations: [3], fixedMinutes: 3, releaseAt: RELEASE_1_2, isNew: true,
  },
  {
    id: 'pizza', name: 'Pizza Party', kind: 'arcade', isNew: true,
    tagline: 'Answer for ingredients and make the pizzas your customers want. Serve fast for tips!',
    bg: 'linear-gradient(150deg, #ff6b3d, #ffb21f 60%, #fff1c9)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'grandprix', name: 'Grand Prix', kind: 'arcade', proOnly: true, isNew: true,
    tagline: 'A real motor race in 3D. Answer for fuel and boost, save your tyres, pit at the right time and win!',
    bg: 'linear-gradient(150deg, #0b0d14, #1d2433 45%, #e10600)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'treasure', name: 'Treasure Hunt', kind: 'arcade', proOnly: true,
    tagline: 'Answer to open chests. Gold, double, triple… or steal from a rival!',
    bg: 'linear-gradient(140deg, #8a5a2b, #ffb21f)',
    durations: [3, 5, 7, 10],
  },
  {
    id: 'candy', name: 'Candy Factory', kind: 'arcade', proOnly: true,
    tagline: 'Answer for cash, buy machines, and make the most candy.',
    bg: 'linear-gradient(140deg, #ff4772, #a560ff)',
    durations: [3, 5, 7, 10],
  },
];

/** A mode that is announced but not out yet (the owner can try it early). */
export const comingSoon = (m, now = Date.now()) => {
  if (!m.releaseAt || now >= m.releaseAt) return false;
  // the browser tests try new modes before release day
  try { if (typeof navigator !== 'undefined' && navigator.webdriver && localStorage.getItem('quickzy.test.early') === '1') return false; } catch { /* ignore */ }
  return true;
};

export const MODE_BY_ID = new Map(MODES.map((m) => [m.id, m]));
export const modeOf = (id) => MODE_BY_ID.get(id) || MODES[0];

/** A small picture for each mode, used on cards. */
export function modeArt(id) {
  const s = svg('svg', { viewBox: '0 0 100 100', class: 'mode-art', 'aria-hidden': 'true' });
  const add = (tag, attrs) => s.append(svg(tag, attrs));
  if (id === 'classic') {
    add('rect', { x: 18, y: 20, width: 30, height: 30, rx: 8, fill: '#ff4772' });
    add('rect', { x: 54, y: 20, width: 30, height: 30, rx: 8, fill: '#2f9bff' });
    add('rect', { x: 18, y: 56, width: 30, height: 30, rx: 8, fill: '#ffcd1f' });
    add('rect', { x: 54, y: 56, width: 30, height: 30, rx: 8, fill: '#12c9a6' });
    add('path', { d: 'M33 26 l-7 11 h5 l-2 8 9 -12 h-5 Z', fill: '#fff' });
    add('path', { d: 'M69 27 c0 0 -7 8 -7 12 a7 7 0 0 0 14 0 c0 -4 -7 -12 -7 -12 Z', fill: '#fff' });
    add('path', { d: 'M33 62 l2.6 5.4 6 .8 -4.3 4.1 1 5.8 -5.3 -2.8 -5.3 2.8 1 -5.8 -4.3 -4.1 6 -.8 Z', fill: '#17133f' });
    add('path', { d: 'M69 62 l8 4.6 v9.2 l-8 4.6 -8 -4.6 v-9.2 Z', fill: '#fff' });
  }
  if (id === 'lasertag') {
    add('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: '#59f0ff', 'stroke-width': 5 });
    add('circle', { cx: 50, cy: 50, r: 6, fill: '#ff4772' });
    add('path', { d: 'M50 12 v18 M50 70 v18 M12 50 h18 M70 50 h18', stroke: '#59f0ff', 'stroke-width': 5, 'stroke-linecap': 'round' });
    add('path', { d: 'M8 88 L40 58', stroke: '#ff4772', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.85 });
  }
  if (id === 'robotrun') {
    add('rect', { x: 30, y: 24, width: 40, height: 34, rx: 10, fill: '#fff' });
    add('rect', { x: 38, y: 32, width: 24, height: 14, rx: 5, fill: '#17133f' });
    add('circle', { cx: 45, cy: 39, r: 3, fill: '#59f0ff' });
    add('circle', { cx: 55, cy: 39, r: 3, fill: '#59f0ff' });
    add('path', { d: 'M50 24 v-9', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' });
    add('circle', { cx: 50, cy: 13, r: 4, fill: '#ffcd1f' });
    add('circle', { cx: 40, cy: 70, r: 10, fill: '#17133f' });
    add('circle', { cx: 62, cy: 70, r: 10, fill: '#17133f' });
    add('path', { d: 'M6 40 h16 M10 52 h12 M4 64 h14', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.7 });
  }
  if (id === 'obby') {
    add('rect', { x: 8, y: 78, width: 30, height: 10, rx: 4, fill: '#fff' });
    add('rect', { x: 40, y: 60, width: 26, height: 10, rx: 4, fill: '#ffcd1f' });
    add('rect', { x: 62, y: 40, width: 30, height: 10, rx: 4, fill: '#fff' });
    add('rect', { x: 30, y: 20, width: 24, height: 10, rx: 4, fill: '#ff4772' });
    add('rect', { x: 66, y: 22, width: 14, height: 18, rx: 4, fill: '#17133f' });
    add('path', { d: 'M20 76 q14 -30 30 -18', fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '4 5' });
  }
  if (id === 'skyrace') {
    add('path', { d: 'M8 30 h26 M4 44 h20 M10 58 h18', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.7 });
    add('path', { d: 'M36 46 C36 40 52 38 72 38 C84 38 92 42 94 46 C92 50 84 54 72 54 C52 54 36 52 36 46 Z', fill: '#fff' });
    add('path', { d: 'M42 46 L34 28 L42 28 L52 44 Z', fill: '#e8112d' });
    add('path', { d: 'M60 48 L74 48 L64 66 L56 66 Z', fill: '#6b4cff' });
    add('path', { d: 'M36 44 L22 46 L36 48 Z', fill: '#ffcd1f' });
    add('path', { d: 'M4 78 L26 76 L30 78 L26 80 Z', fill: '#4a5068' });
    add('path', { d: 'M30 78 h14', stroke: '#ff4772', 'stroke-width': 3, 'stroke-linecap': 'round' });
  }
  if (id === 'train') {
    add('path', { d: 'M0 84 H100', stroke: '#2a1a10', 'stroke-width': 4 });
    for (let x = 4; x < 100; x += 12) add('rect', { x, y: 84, width: 7, height: 6, fill: '#5a3a1a' });
    add('rect', { x: 22, y: 46, width: 46, height: 24, rx: 10, fill: '#1d1d24' });
    add('rect', { x: 60, y: 30, width: 26, height: 40, rx: 3, fill: '#8a1f1f' });
    add('rect', { x: 66, y: 36, width: 14, height: 12, rx: 2, fill: '#ffd27a' });
    add('rect', { x: 28, y: 32, width: 9, height: 16, fill: '#1d1d24' });
    add('path', { d: 'M8 70 L22 58 V72 Z', fill: '#c9a24a' });
    for (const [x, r] of [[34, 9], [54, 9], [76, 7]]) { add('circle', { cx: x, cy: 76, r, fill: '#c9a24a' }); add('circle', { cx: x, cy: 76, r: r - 4, fill: '#1d1d24' }); }
    add('circle', { cx: 32, cy: 20, r: 8, fill: 'rgba(255,255,255,.8)' });
    add('circle', { cx: 20, cy: 12, r: 6, fill: 'rgba(255,255,255,.6)' });
  }
  if (id === 'treasure') {
    add('rect', { x: 20, y: 46, width: 60, height: 36, rx: 5, fill: '#8a5a2b' });
    add('path', { d: 'M20 50 Q50 18 80 50 Z', fill: '#a8703c' });
    add('rect', { x: 20, y: 46, width: 60, height: 7, fill: '#ffcd1f' });
    add('rect', { x: 45, y: 50, width: 10, height: 14, rx: 2, fill: '#ffcd1f' });
    for (const [x, y] of [[30, 30], [62, 24], [76, 36]]) add('circle', { cx: x, cy: y, r: 5, fill: '#ffe45c' });
  }
  if (id === 'pizza') {
    add('circle', { cx: 50, cy: 54, r: 36, fill: '#f2b263' });
    add('circle', { cx: 50, cy: 54, r: 30, fill: '#e8463a' });
    add('circle', { cx: 50, cy: 54, r: 26, fill: '#ffd25a' });
    for (const [x, y] of [[40, 44], [60, 46], [46, 64], [64, 62], [34, 58]]) add('circle', { cx: x, cy: y, r: 5, fill: '#c0392b' });
    for (const [x, y] of [[54, 36], [30, 48], [70, 54]]) add('circle', { cx: x, cy: y, r: 3, fill: '#2d7a3a' });
    add('path', { d: 'M50 54 L86 40 A38 38 0 0 1 88 62 Z', fill: '#17133f', opacity: 0.18 });
  }
  if (id === 'grandprix') {
    // a race car from above, on a chequered flag
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2) add('rect', { x: 8 + i * 9, y: 8 + j * 9, width: 9, height: 9, fill: '#ffffff', opacity: 0.35 });
    add('path', { d: 'M8 80 Q40 60 92 66', stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': '6 5', opacity: 0.6 });
    add('rect', { x: 20, y: 43, width: 66, height: 14, rx: 7, fill: '#e10600' });
    add('rect', { x: 80, y: 38, width: 8, height: 24, rx: 2, fill: '#17133f' });
    add('rect', { x: 14, y: 40, width: 6, height: 20, rx: 2, fill: '#17133f' });
    for (const [x, y] of [[30, 36], [30, 64], [66, 36], [66, 64]]) add('rect', { x: x - 6, y: y - 4, width: 12, height: 8, rx: 3, fill: '#17133f' });
    add('circle', { cx: 50, cy: 50, r: 5, fill: '#ffd400' });
    add('path', { d: 'M86 50 h8', stroke: '#ffd400', 'stroke-width': 4, 'stroke-linecap': 'round' });
  }
  if (id === 'candy') {
    add('rect', { x: 10, y: 66, width: 80, height: 10, rx: 5, fill: '#17133f' });
    add('circle', { cx: 30, cy: 52, r: 12, fill: '#ffcd1f' });
    add('path', { d: 'M30 64 V90', stroke: '#fff', 'stroke-width': 4 });
    add('rect', { x: 50, y: 42, width: 30, height: 22, rx: 6, fill: '#12c9a6' });
    add('path', { d: 'M50 53 L42 46 V60 Z M80 53 L88 46 V60 Z', fill: '#12c9a6' });
    add('circle', { cx: 30, cy: 52, r: 6, fill: 'none', stroke: '#ff4772', 'stroke-width': 3 });
  }
  return s;
}
