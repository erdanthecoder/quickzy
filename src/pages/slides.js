// slides.js — how a Presentation+ slide looks: the design theme, the layout,
// and (in the editor) text you click and type into, like PowerPoint.
//
// The same drawing is used for the thumbnails, the editor, the big screen
// and the gallery, and it scales with its box (sizes are in em of a font
// size set from the box width).

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { mainHost } from '../config.js';

export const THEME_INFO = {
  clean: { name: 'Clean', dark: false },
  midnight: { name: 'Midnight', dark: true },
  paper: { name: 'Paper', dark: false },
  ocean: { name: 'Ocean', dark: true },
  sunset: { name: 'Sunset', dark: true },
  forest: { name: 'Forest', dark: true },
  kyrgyz: { name: 'Tunduk', dark: true },
  quickzy: { name: 'Quickzy', dark: true },
};
// the Quickzy theme's colour choices (older slides use these)
export const BGS = ['linear-gradient(135deg,#6b4cff,#4a2fd6)', 'linear-gradient(135deg,#ff4772,#ff8a2a)', 'linear-gradient(135deg,#12c9a6,#2f9bff)',
  'linear-gradient(135deg,#17133f,#3a2399)', 'linear-gradient(135deg,#ffcd1f,#ff8a2a)', 'linear-gradient(135deg,#2f9bff,#a560ff)'];
export const COLS = ['#ff4772', '#2f9bff', '#ffb21f', '#12c9a6', '#a560ff', '#ff8a2a'];

let fontsAsked = false;
/** The presentation fonts, fetched once when slides are first drawn. */
function fonts() {
  if (fontsAsked || typeof document === 'undefined') return;
  fontsAsked = true;
  document.head.append(h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Space+Grotesk:wght@500;700&display=swap' }));
}

/**
 * A slide. `edit(key, value)` makes the text editable in place.
 * `votes`, `reveal`, `pin`, `count` are for live slides on the big screen.
 */
export function slideView(s, { votes = {}, reveal = false, pin = '', count = 0, edit = null, number = 0 } = {}) {
  fonts();
  const th = THEME_INFO[s.th] ? s.th : 'quickzy';
  // a piece of text: plain on screen, typed into in the editor
  const text = (tag, key, cls, ph) => {
    const el = h(tag, { class: cls || null, 'data-ph': ph || null });
    el.textContent = s[key] || '';
    if (edit) {
      el.contentEditable = 'plaintext-only';
      el.spellcheck = true;
      el.dataset.key = key;
      el.addEventListener('input', () => edit(key, el.innerText.replace(/\n$/, '')));
      el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    }
    return el;
  };
  // points, one per line: a list on screen, the same list typed into in the editor
  const points = (key, ph) => {
    const lines = String(s[key] || '').split('\n').filter((l) => l.trim());
    if (!edit) return h('ul', { class: 'sl-points' }, ...lines.map((l) => h('li', {}, l)));
    const el = h('div', { class: 'sl-points is-edit', 'data-ph': ph });
    el.textContent = String(s[key] || '');
    el.contentEditable = 'plaintext-only';
    el.dataset.key = key;
    el.addEventListener('input', () => edit(key, el.innerText.replace(/\n$/, '')));
    el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    return el;
  };
  const picture = (cls) => (s.img
    ? h('img', { class: cls, src: s.img, alt: '', referrerpolicy: 'no-referrer', draggable: 'false' })
    : edit ? h('div', { class: `${cls} sl-img-empty` }, icon('camera', { size: 28 }), h('span', {}, 'Add a picture from the Insert tab')) : null);

  const tally = (n) => { const c = Array(n).fill(0); for (const v of Object.values(votes)) if (Number.isInteger(v) && v >= 0 && v < n) c[v] += 1; return c; };
  const kids = [];
  const t = s.t;
  if (t === 'title') {
    kids.push(h('div', { class: 'sl-title' }, h('i', { class: 'sl-rule' }), text('h1', 'head', '', 'Click to add title'), text('p', 'body', 'sl-sub', 'Click to add subtitle')));
  } else if (t === 'section') {
    kids.push(h('div', { class: 'sl-section' }, h('span', { class: 'sl-num' }, number ? String(number).padStart(2, '0') : ''), text('h1', 'head', '', 'Section title'), text('p', 'body', 'sl-sub', 'A line about this part')));
  } else if (t === 'content' && s.img && !s.head && !String(s.body || '').trim() && !edit) {
    kids.push(h('img', { class: 'sl-full', src: s.img, alt: '', referrerpolicy: 'no-referrer' }));
  } else if (t === 'content') {
    kids.push(h('div', { class: `sl-content${s.img ? ' has-img' : ''}` },
      h('div', { class: 'sl-col' }, text('h2', 'head', '', 'Click to add title'), points('body', 'Click to add text, one point per line')),
      s.img ? picture('sl-pic') : null));
  } else if (t === 'two') {
    kids.push(h('div', { class: 'sl-two' }, text('h2', 'head', '', 'Click to add title'),
      h('div', { class: 'sl-cols' }, points('body', 'Left column'), points('body2', 'Right column'))));
  } else if (t === 'image') {
    kids.push(h('div', { class: 'sl-image' }, picture('sl-pic'), text('p', 'head', 'sl-cap', 'Click to add a caption')));
  } else if (t === 'quote') {
    kids.push(h('figure', { class: 'sl-quote' }, h('span', { class: 'sl-qmark', 'aria-hidden': 'true' }, '“'), text('blockquote', 'body', '', 'Type the quote'), h('figcaption', {}, text('span', 'head', '', 'Who said it'))));
  } else if (t === 'big') {
    kids.push(h('div', { class: 'sl-big' }, text('b', 'head', '', '42'), text('p', 'body', '', 'What the number means')));
  } else if (t === 'poll' || t === 'quiz') {
    const c = tally(s.opts.length);
    const max = Math.max(1, ...c);
    kids.push(text('h2', 'head', 'sl-q', 'Type the question'),
      h('div', { class: 'sl-bars' }, ...s.opts.map((o, i) => h('div', { class: `sl-bar${reveal && t === 'quiz' ? (i === s.ans ? ' is-right' : ' is-wrong') : ''}` },
        h('div', { class: 'sl-bar-track' }, h('i', { style: { height: `${(c[i] / max) * 100}%`, background: COLS[i % 6] } }, h('b', {}, String(c[i])))),
        h('span', { style: { background: COLS[i % 6] } }, (reveal || edit) && t === 'quiz' && i === s.ans ? icon('check', { size: 16 }) : null, o)))));
  } else if (t === 'guess') {
    const vals = Object.values(votes).filter((v) => typeof v === 'number');
    const span = s.max - s.min || 1;
    const pos = (v) => `${((v - s.min) / span) * 100}%`;
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const buckets = Array(20).fill(0);
    for (const v of vals) buckets[Math.min(19, Math.max(0, Math.floor(((v - s.min) / span) * 20)))] += 1;
    const top = Math.max(1, ...buckets);
    kids.push(text('h2', 'head', 'sl-q', 'Type the question'),
      h('div', { class: 'sl-guess' },
        h('div', { class: 'sl-hist' }, ...buckets.map((b) => h('i', { style: { height: `${(b / top) * 100}%` } }))),
        h('div', { class: 'sl-axis' }, h('span', {}, `${s.min}${s.unit ? ` ${s.unit}` : ''}`), h('span', {}, `${s.max}${s.unit ? ` ${s.unit}` : ''}`)),
        avg !== null ? h('div', { class: 'sl-mark is-avg', style: { left: pos(avg) } }, h('small', {}, `Average ${Math.round(avg * 10) / 10}`)) : null,
        reveal && s.ans !== undefined ? h('div', { class: 'sl-mark is-ans', style: { left: pos(s.ans) } }, h('small', {}, `Answer: ${s.ans}${s.unit ? ` ${s.unit}` : ''}`)) : null));
  }
  const live = t === 'poll' || t === 'quiz' || t === 'guess';
  return h('div', { class: `slide sl-${t} th-${th}${edit ? ' is-editing' : ''}${live ? ' is-live' : ''}`, style: th === 'quickzy' ? { background: BGS[(s.bg || 0) % BGS.length] } : null },
    h('div', { class: 'sl-deco', 'aria-hidden': 'true' }),
    ...kids,
    pin ? h('div', { class: 'sl-pin' }, h('small', {}, `Join at ${mainHost()}`), h('b', {}, `${pin.slice(0, 3)} ${pin.slice(3)}`), count ? h('small', {}, `${count} answered`) : null) : null);
}
