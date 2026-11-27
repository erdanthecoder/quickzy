// blooks.js — your blook cards: open boxes, see the collection, build up to
// three custom blooks, and see what each level unlocks.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { blook, BLOOKS, RARITIES, rarityOf, blookName, CUSTOM_PARTS, PART_NAMES, customId, customParts } from '../ui/blooks.js';
import { modal, busy, toast } from '../ui/kit.js';
import { signedIn, whenProfile, updateProfile } from '../services/session.js';
import * as progress from '../services/progress.js';
import { myPlan, proNow } from '../services/plan.js';
import { sfx } from '../game/sound.js';
import { celebrate } from '../ui/confetti.js';
import { pageTitle } from './parts.js';

/** One blook as a trading card. */
export function blookCard(id, { owned = true, count = 0, big = false, onclick } = {}) {
  const r = rarityOf(id);
  const b = blook(id);
  return h(onclick ? 'button' : 'div', {
    class: `bcard r-${r.id}${owned ? '' : ' is-locked'}${big ? ' is-big' : ''}`, style: { '--rc': r.colour },
    type: onclick ? 'button' : null, onclick,
    'aria-label': owned ? `${blookName(id, nameMap())}, ${r.name}` : `Not collected yet, ${r.name}`,
  },
  h('span', { class: 'bcard-rarity' }, r.name),
  h('span', { class: 'bcard-art' }, b),
  h('b', { class: 'bcard-name' }, owned ? blookName(id, nameMap()) : '???'),
  count > 1 ? h('span', { class: 'bcard-count' }, `x${count}`) : null);
}

function nameMap() {
  const out = {};
  progress.me().customs.forEach((id, i) => { out[id] = `Custom ${i + 1}`; });
  return out;
}

function header() {
  const m = progress.me();
  const info = progress.levelInfo(m.xp);
  return h('section', { class: 'card level-card' },
    h('div', { class: 'level-badge' }, h('small', {}, 'Level'), h('b', {}, String(info.level))),
    h('div', { class: 'grow stack', style: { gap: '6px' } },
      h('div', { class: 'row spread' }, h('b', {}, info.level >= progress.MAX_LEVEL ? 'Top level' : `${info.into} / ${info.need} XP to level ${info.level + 1}`),
        h('span', { class: 'coins' }, coin(), String(m.coins))),
      h('div', { class: 'xp-bar' }, h('i', { style: { width: `${Math.round(info.frac * 100)}%` } })),
      h('small', { class: 'muted' }, 'Play games to earn XP and coins. Finishing in the top three earns extra coins.')));
}

export function coin() {
  return h('span', { class: 'coin', 'aria-hidden': 'true' }, 'Q');
}

/* ------------------------------------------------------------------ boxes */

/** The chance of each rarity from this box, given what is in its pool. */
function boxOdds(box) {
  const tiers = RARITIES.filter((r) => box.pool.some((id) => rarityOf(id).id === r.id));
  const total = tiers.reduce((n, r) => n + r.chance, 0);
  return tiers.map((r) => [r, box.luck === 1 ? r.chance / total : luckyChance(r.id, box.luck)]);
}

function daysLeft(ends) {
  const d = Math.ceil((ends - Date.now()) / 86400000);
  return d <= 1 ? 'Last day!' : `${d} days left`;
}

// how many of each pack you last chose to open
const pickCount = {};
const COUNTS = [1, 5, 10];

function boxes(redraw) {
  const m = progress.me();
  const lvl = progress.levelOf(m.xp);
  // limited editions first while they last; closed ones disappear
  const list = progress.BOXES.filter((b) => progress.boxOpen(b)).sort((x, y) => Number(Boolean(y.limited)) - Number(Boolean(x.limited)));
  return h('div', { class: 'boxes' }, ...list.map((box) => {
    const locked = lvl < box.level;
    const can = Math.floor(m.coins / box.price);
    let n = Math.max(1, Math.min(pickCount[box.id] || 1, ...COUNTS.filter((c) => c <= Math.max(1, can))));
    const open = h('button', { class: 'btn btn-main box-open', disabled: locked || can < 1 });
    const label = () => fill(open, n > 1 ? `Open ${n}` : 'Open', coin(), String(box.price * n));
    const chips = COUNTS.map((c) => h('button', { type: 'button', class: 'pk-n', disabled: locked || c > can, 'aria-pressed': String(c === n) }, `×${c}`));
    chips.forEach((b, i) => b.addEventListener('click', () => {
      n = COUNTS[i];
      pickCount[box.id] = n;
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sfx('pick');
      label();
    }));
    label();
    open.addEventListener('click', busy(open, async () => {
      try { await openPacks(box, n); } catch (err) { toast(err.message, 'bad'); }
      redraw();
    }));
    const odds = boxOdds(box).map(([r, p]) => h('li', {}, h('i', { style: { background: r.colour } }), `${r.name} ${fmtPct(p)}`));
    const peek = h('div', { class: 'box-peek', 'aria-label': 'Blooks in this pack' },
      ...box.pool.slice().sort((x, y) => ORDER.indexOf(rarityOf(y).id) - ORDER.indexOf(rarityOf(x).id)).slice(0, 6)
        .map((id) => { const el = blook(id); if (!progress.owns(id)) el.classList.add('is-unknown'); return el; }));
    return h('div', { class: `box-card pk-${box.id}${locked ? ' is-locked' : ''}${box.limited ? ' is-limited' : ''}`, style: { background: box.colour } },
      box.limited ? h('div', { class: 'snow', 'aria-hidden': 'true' }) : null,
      box.limited ? h('span', { class: 'limited-tag' }, icon('star', { size: 12 }), box.blurb, ' · ', daysLeft(box.ends)) : null,
      h('div', { class: 'box-art' }, boxArt(box)),
      h('h3', {}, box.name),
      peek,
      locked ? h('p', {}, icon('lock', { size: 14 }), ` Opens at level ${box.level}`) : h('ul', { class: 'odds' }, ...odds),
      locked ? null : h('div', { class: 'pk-count', role: 'group', 'aria-label': 'How many packs to open' }, ...chips),
      open);
  }));
}

const ORDER = RARITIES.map((r) => r.id);
/** Chance this rarity or rarer, from one draw. */
const cumulative = (id) => RARITIES.slice(ORDER.indexOf(id)).reduce((n, r) => n + r.chance, 0);
/** With several draws keeping the rarest: P(best is exactly this rarity). */
function luckyChance(id, draws) {
  const atLeast = 1 - (1 - cumulative(id)) ** draws;
  const next = ORDER.indexOf(id) + 1 < ORDER.length ? 1 - (1 - cumulative(ORDER[ORDER.indexOf(id) + 1])) ** draws : 0;
  return atLeast - next;
}
const fmtPct = (p) => `${p < 0.1 ? (p * 100).toFixed(1) : Math.round(p * 100)}%`;

// every pack has its own look
const ART = {
  // a purple gift box with the Q on it
  basic: '<rect x="18" y="40" width="64" height="46" rx="10" fill="#fff"/><rect x="12" y="28" width="76" height="18" rx="8" fill="#efe9ff"/>'
    + '<rect x="45" y="28" width="10" height="58" fill="#6b4cff"/><path d="M50 28 C36 8 22 18 34 28 Z M50 28 C64 8 78 18 66 28 Z" fill="#ffcd1f"/>'
    + '<circle cx="50" cy="64" r="13" fill="#6b4cff"/><text x="50" y="70" text-anchor="middle" font-size="17" font-weight="900" fill="#fff" font-family="sans-serif">Q</text>',
  // a Christmas present under snow
  winter: '<rect x="18" y="40" width="64" height="46" rx="10" fill="#fff"/><rect x="12" y="28" width="76" height="18" rx="8" fill="#fff"/>'
    + '<rect x="45" y="28" width="10" height="58" fill="#e2384d"/><path d="M50 28 C36 8 22 18 34 28 Z M50 28 C64 8 78 18 66 28 Z" fill="#e2384d"/>'
    + '<path d="M14 30 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#dff1ff" stroke-width="5" stroke-linecap="round"/>'
    + '<circle cx="72" cy="62" r="5" fill="#19a35b"/><circle cx="64" cy="72" r="4" fill="#ffcd1f"/><circle cx="28" cy="66" r="4" fill="#19a35b"/>',
  // a wooden cargo crate on rails
  rails: '<rect x="8" y="84" width="84" height="5" rx="2" fill="#5a3b22"/><rect x="16" y="78" width="6" height="12" fill="#3b2a1e"/><rect x="47" y="78" width="6" height="12" fill="#3b2a1e"/><rect x="78" y="78" width="6" height="12" fill="#3b2a1e"/>'
    + '<rect x="16" y="26" width="68" height="52" rx="6" fill="#d9954f"/><rect x="16" y="26" width="68" height="52" rx="6" fill="none" stroke="#7a4b24" stroke-width="5"/>'
    + '<path d="M19 29 L81 75 M81 29 L19 75" stroke="#7a4b24" stroke-width="5"/><circle cx="50" cy="52" r="11" fill="#ffcd1f" stroke="#7a4b24" stroke-width="3"/>'
    + '<path d="M44 52 h12 M50 46 v12" stroke="#7a4b24" stroke-width="3" stroke-linecap="round"/>',
  // a picnic basket with a paw print
  animal: '<path d="M26 42 C26 14 74 14 74 42" fill="none" stroke="#8b5a2b" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M12 40 H88 L80 86 H20 Z" fill="#e0a95f"/><path d="M16 52 H84 M18 64 H82 M19 76 H81" stroke="#b67a3a" stroke-width="3"/>'
    + '<rect x="10" y="36" width="80" height="10" rx="5" fill="#b67a3a"/>'
    + '<ellipse cx="50" cy="68" rx="9" ry="8" fill="#fff"/><circle cx="38" cy="56" r="4.5" fill="#fff"/><circle cx="46" cy="51" r="4.5" fill="#fff"/><circle cx="54" cy="51" r="4.5" fill="#fff"/><circle cx="62" cy="56" r="4.5" fill="#fff"/>',
  // a shiny crisp packet
  snack: '<path d="M22 14 H78 L74 22 C82 46 82 62 74 82 L78 90 H22 L26 82 C18 62 18 46 26 22 Z" fill="#ffd23f"/>'
    + '<path d="M22 14 H78 L74 22 H26 Z M26 82 H74 L78 90 H22 Z" fill="#ff4772"/>'
    + '<path d="M22 14 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3 l4 -3" fill="none" stroke="#c22a52" stroke-width="2"/>'
    + '<ellipse cx="50" cy="52" rx="18" ry="14" fill="#ff8a2a"/><text x="50" y="57" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="sans-serif">YUM</text>'
    + '<path d="M32 30 C30 40 30 48 31 54" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>',
  // a planet with a ring and stars
  space: '<circle cx="50" cy="52" r="26" fill="#7b5cff"/><circle cx="42" cy="44" r="6" fill="#a58bff"/><circle cx="58" cy="62" r="4" fill="#5a3fd6"/>'
    + '<ellipse cx="50" cy="54" rx="44" ry="11" fill="none" stroke="#ffcd1f" stroke-width="5" transform="rotate(-14 50 54)"/>'
    + '<path d="M50 26 A26 26 0 0 1 76 52" fill="none" stroke="#fff" stroke-width="3" opacity=".35"/>'
    + '<path d="M16 16 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z M84 78 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z M82 18 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1 Z" fill="#fff"/>',
  // a treasure chest full of gold
  gold: '<path d="M14 44 C14 20 86 20 86 44 Z" fill="#b8551f"/><rect x="14" y="44" width="72" height="42" rx="6" fill="#d66a26"/>'
    + '<rect x="14" y="40" width="72" height="8" fill="#ffcd1f"/><rect x="24" y="24" width="6" height="62" fill="#ffcd1f"/><rect x="70" y="24" width="6" height="62" fill="#ffcd1f"/>'
    + '<rect x="42" y="40" width="16" height="18" rx="3" fill="#ffe27a" stroke="#8a4a12" stroke-width="2.5"/><circle cx="50" cy="48" r="3" fill="#8a4a12"/>'
    + '<path d="M36 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z M66 12 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z" fill="#fff6c2"/>',
};

function boxArt(box) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ART[box.id] || ART.basic;
  return s;
}

/** Open packs, one batch after another, without leaving the opening screen. */
async function openPacks(box, n) {
  let count = n;
  while (count) count = await packShow(box, count);
}

/**
 * The opening screen. Tap the pack to tear it open, then every card flips
 * out one by one (tap for the next, or Skip to see them all). At the end you
 * see everything you got, and can open more right there.
 * Resolves the number of packs to open next, or 0 when done.
 */
function packShow(box, n) {
  const calm = document.documentElement.dataset.motion === 'calm';
  const wait = (ms) => new Promise((res) => setTimeout(res, calm ? Math.min(ms, 30) : ms));
  return new Promise((resolve) => {
    const results = [];
    let failed = null;
    let wake = () => {};
    const ready = (i) => new Promise((res) => {
      const check = () => { if (results[i] || failed) res(); else wake = check; };
      check();
    });
    const job = progress.openBoxes(box.id, n, (res, i) => { results[i] = res; wake(); })
      .catch((err) => { failed = err; wake(); });

    let done = false;
    let skipping = false;
    let shown = false;
    const count = h('span', { class: 'pk-left' });
    const skip = h('button', { class: 'btn btn-sm pk-skip' }, n > 1 ? 'Skip to all' : 'Skip');
    const stage = h('div', { class: 'pk-stage' });
    const hint = h('p', { class: 'pk-hint' });
    const foot = h('div', { class: 'pk-foot' });
    const root = h('div', { class: `pk-root pk-${box.id}${calm ? ' pk-calm' : ''}`, role: 'dialog', 'aria-label': `Opening ${n > 1 ? `${n} × ` : ''}${box.name}`, style: { '--pack': box.colour } },
      h('div', { class: 'pk-bg', 'aria-hidden': 'true' }),
      h('div', { class: 'pk-top' }, h('h2', {}, box.name), count, skip),
      stage, hint, foot);
    document.body.append(root);
    const setCount = (i) => fill(count, n > 1 ? `${Math.min(i, n)} / ${n}` : '');
    setCount(0);

    let next = () => {};
    const tapNext = () => next();
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (shown) close(0); else skipAll(); } else if (e.key === ' ' || e.key === 'Enter') {
        if (e.target instanceof HTMLButtonElement && root.contains(e.target) && !e.target.classList.contains('pk-skip')) return;
        e.preventDefault(); tapNext();
      }
    };
    document.addEventListener('keydown', key);
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', key);
      root.classList.add('pk-out');
      setTimeout(() => { root.remove(); resolve(value); }, 220);
    };
    const tapped = () => new Promise((res) => { next = () => { next = () => {}; res(); }; });
    function skipAll() { skipping = true; next(); }
    skip.onclick = skipAll;
    stage.addEventListener('click', tapNext);

    (async () => {
      // 1. the pack: tap to tear it open
      const pack = h('button', { type: 'button', class: 'pk-pack', 'aria-label': `Open the ${box.name}` }, boxArt(box),
        n > 1 ? h('span', { class: 'pk-stack', 'aria-hidden': 'true' }, `×${n}`) : null);
      stage.replaceChildren(h('div', { class: 'pk-halo' }), pack);
      fill(hint, n > 1 ? `Tap to open all ${n}!` : 'Tap to open!');
      sfx('pack-tap');
      await tapped();
      pack.classList.add('pk-rip');
      sfx('pack-open');
      fill(hint, '');
      await wait(380);

      // 2. the cards, one by one
      for (let i = 0; i < n && !skipping; i++) {
        await ready(i);
        if (failed && !results[i]) break;
        const res = results[i];
        const r = rarityOf(res.id);
        const rank = ORDER.indexOf(r.id);
        setCount(i + 1);
        const card = blookCard(res.id, { big: true });
        card.classList.add('pk-card', `pk-card-${r.id}`);
        root.style.setProperty('--rc', r.colour);
        root.dataset.rarity = r.id;
        stage.replaceChildren(h('div', { class: 'pk-glow' }), card);
        fill(hint,
          h('b', { class: 'pk-rarity', style: { color: r.colour } }, r.name),
          res.duplicate ? h('span', {}, ' · repeat, ', coin(), `+${res.refund}`) : h('span', { class: 'pk-new' }, 'NEW'));
        sfx(`card-${rank}`);
        if (!calm && rank >= 3) setTimeout(() => celebrate([r.colour, '#ffffff', '#ffcd1f']), 200);
        if (n > 1) {
          fill(foot, i < n - 1
            ? h('button', { class: 'btn btn-main', onclick: tapNext }, 'Next', h('small', {}, ` ${i + 2}/${n}`))
            : h('button', { class: 'btn btn-main', onclick: tapNext }, 'See them all'));
          await tapped();
        } else {
          await wait(500);
        }
      }
      // every pack saved (coins back may still be on their way)
      await ready(n - 1);
      if (failed) toast(failed.message, 'bad');
      else job.then(() => { if (failed) toast(failed.message, 'bad'); });
      summary();
    })().catch((err) => { console.error(err); close(0); });

    function summary() {
      const got = results.filter(Boolean);
      if (!got.length) { close(0); return; }
      shown = true;
      skip.remove();
      setCount(n);
      root.removeAttribute('data-rarity');
      const best = got.reduce((a, b) => (ORDER.indexOf(rarityOf(b.id).id) > ORDER.indexOf(rarityOf(a.id).id) ? b : a));
      root.style.setProperty('--rc', rarityOf(best.id).colour);
      const fresh = got.filter((x) => !x.duplicate).length;
      const back = got.reduce((s, x) => s + x.refund, 0);
      const sorted = got.slice().sort((a, b) => ORDER.indexOf(rarityOf(b.id).id) - ORDER.indexOf(rarityOf(a.id).id));
      const grid = h('div', { class: `pk-grid${got.length === 1 ? ' is-one' : ''}` }, ...sorted.map((x, k) => {
        const c = blookCard(x.id, { big: got.length === 1 });
        c.style.setProperty('--k', k);
        c.append(x.duplicate ? h('span', { class: 'pk-tag' }, coin(), `+${x.refund}`) : h('span', { class: 'pk-tag is-new' }, 'NEW'));
        return c;
      }));
      stage.replaceChildren(grid);
      stage.classList.add('is-summary');
      if (got.length === 1) {
        const r = rarityOf(got[0].id);
        fill(hint, h('b', { class: 'pk-rarity', style: { color: r.colour } }, r.name),
          got[0].duplicate ? h('span', {}, ' · repeat, ', coin(), `+${got[0].refund}`) : h('span', { class: 'pk-new' }, 'NEW'));
      } else fill(hint, h('b', {}, `${fresh} new`), ` · ${got.length - fresh} repeat${got.length - fresh === 1 ? '' : 's'}`,
        back ? h('span', {}, ' · ', coin(), `+${back} back`) : '');
      const coins = progress.me().coins;
      const again = progress.boxOpen(box) ? COUNTS.filter((c) => c * box.price <= coins)
        .map((c) => h('button', { class: 'btn', onclick: () => { pickCount[box.id] = c; close(c); } }, `Open ${c} more`, coin(), String(c * box.price))) : [];
      fill(foot, h('div', { class: 'pk-again' }, ...again, h('button', { class: 'btn btn-main', onclick: () => close(0) }, 'Done')));
      sfx('pack-done');
      foot.querySelector('.btn-main').focus();
    }
  });
}

/* ------------------------------------------------------------- collection */

// the catalog, pack by pack: every blook there is, black shadows for the
// ones not found yet
const SETS = [['Flags', 'Flags (exclusive)'], ['Winter', 'Winter (limited edition)'], ['Rails', 'Wild Rails'], ['Pets', 'Pets'], ['Farm', 'Farm'], ['Wild', 'Wild'], ['Snacks', 'Snacks'], ['Space', 'Space'], ['Magic', 'Magic']];

// the catalog's filters, kept while you open boxes or switch tabs
const view = { tab: 'shop', rarity: 'all', owned: false, text: '' };

function catalog(redraw) {
  const m = progress.me();
  const have = BLOOKS.filter((b) => progress.owns(b.id)).length;
  const match = (b) => (view.rarity === 'all' || rarityOf(b.id).id === view.rarity)
    && (!view.owned || progress.owns(b.id))
    && (!view.text || (progress.owns(b.id) && blookName(b.id, nameMap()).toLowerCase().includes(view.text)));
  const groups = SETS.map(([set, label]) => {
    const all = BLOOKS.filter((b) => b.set === set);
    const list = all.filter(match).sort((x, y) => ORDER.indexOf(rarityOf(x.id).id) - ORDER.indexOf(rarityOf(y.id).id));
    if (!list.length) return null;
    const got = all.filter((b) => progress.owns(b.id)).length;
    return h('section', { class: 'set-panel' },
      h('header', {},
        h('h3', {}, label),
        h('div', { class: 'set-meter', title: `${got} of ${all.length} found` }, h('i', { style: { width: `${Math.round((got / all.length) * 100)}%` } })),
        h('span', { class: `set-count${got === all.length ? ' is-done' : ''}` }, got === all.length ? 'Complete' : `${got} / ${all.length}`)),
      h('div', { class: 'card-grid set-grid' }, ...list.map((b) => blookCard(b.id, {
        owned: progress.owns(b.id),
        count: m.owned[b.id] || 0,
        onclick: progress.owns(b.id) ? () => useBlook(b.id) : null,
      }))));
  }).filter(Boolean);
  const chip = (id, label, colour) => h('button', { type: 'button', class: `chip${view.rarity === id ? ' is-on' : ''}`, style: colour ? { '--c': colour } : null, onclick: () => { view.rarity = id; redraw(); } }, colour ? h('i', { class: 'chip-dot' }) : null, label);
  const search = h('input', { class: 'input bk-search', type: 'search', placeholder: 'Find a blook you own', value: view.text, oninput: (e) => { view.text = e.target.value.trim().toLowerCase(); redraw(true); } });
  return h('div', { class: 'stack', style: { gap: '14px' } },
    h('div', { class: 'bk-progress' },
      h('div', {}, h('b', {}, `${have} of ${BLOOKS.length}`), h('small', {}, 'blooks found')),
      h('div', { class: 'xp-bar grow' }, h('i', { style: { width: `${Math.round((have / BLOOKS.length) * 100)}%` } }))),
    h('div', { class: 'bk-filters' },
      h('div', { class: 'row', style: { gap: '6px' } }, chip('all', 'All'), ...RARITIES.map((r) => chip(r.id, r.name, r.colour))),
      h('div', { class: 'row', style: { gap: '8px' } },
        search,
        h('label', { class: 'bk-owned' }, h('input', { type: 'checkbox', checked: view.owned, onchange: (e) => { view.owned = e.target.checked; redraw(); } }), 'Only mine'))),
    groups.length ? h('div', { class: 'stack', style: { gap: '14px' } }, ...groups)
      : h('div', { class: 'card flat center' }, h('p', { class: 'muted', style: { margin: 0 } }, 'No blooks match. Try another filter.')),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Shadows are blooks you have not found yet. Tap one you own to use it in games.'));
}

async function useBlook(id) {
  try { await updateProfile({ blook: id }); sfx('pick'); toast(`${blookName(id, nameMap())} is now your blook`, 'ok'); } catch (err) { toast(err.message, 'bad'); }
}

/* ---------------------------------------------------------------- customs */

function customs(redraw) {
  const m = progress.me();
  const open = progress.customSlots();
  return h('section', { class: 'stack' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Custom blooks'), h('span', { class: 'pill' }, `${m.customs.length} of 3`)),
    h('p', { class: 'muted', style: { margin: 0 } }, 'Build your own blook. You get three, unlocked at levels 3, 6 and 10. Custom blooks count as legendary.'),
    h('div', { class: 'card-grid' }, ...[0, 1, 2].map((slot) => {
      const id = m.customs[slot];
      if (slot >= open) {
        return h('div', { class: 'bcard is-slot is-locked' }, icon('lock', { size: 30 }), h('b', {}, `Level ${progress.CUSTOM_SLOTS[slot]}`));
      }
      if (!id) {
        return h('button', { class: 'bcard is-slot', onclick: () => builder(slot, null, redraw) }, icon('plus', { size: 30 }), h('b', {}, 'Make one'));
      }
      const card = blookCard(id, { onclick: () => builder(slot, id, redraw) });
      return h('div', { class: 'stack', style: { gap: '6px' } }, card,
        h('button', { class: 'btn btn-sm', onclick: () => useBlook(id) }, 'Use'));
    })));
}

function builder(slot, existing, redraw) {
  const lvl = progress.levelOf(progress.me().xp);
  const parts = existing ? customParts(existing) : { body: 0, eyes: 0, mouth: 0, top: 0, extra: 0 };
  return modal((close) => {
    const preview = h('div', { class: 'builder-preview' });
    const rows = h('div', { class: 'stack', style: { gap: '12px' } });
    const draw = () => {
      fill(preview, blook(customId(parts)));
      fill(rows, ...Object.entries(CUSTOM_PARTS).map(([part, options]) => h('div', { class: 'stack', style: { gap: '6px' } },
        h('b', {}, PART_NAMES[part]),
        h('div', { class: 'row', style: { gap: '6px' } }, ...options.map((opt, i) => {
          const need = progress.partLevel(part, i);
          const locked = need > lvl && !proNow();
          const on = parts[part] === i;
          const label = part === 'body'
            ? h('span', { class: 'swatch', style: { background: opt[0] } })
            : h('span', {}, String(opt).replace(/^none$/, 'None'));
          return h('button', {
            type: 'button', class: `part-btn${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`, disabled: locked,
            title: locked ? `Unlocks at level ${need}` : '', 'aria-pressed': String(on),
            onclick: () => { parts[part] = i; sfx('pick'); draw(); },
          }, label, locked ? h('small', {}, `Lv ${need}`) : null);
        })))));
    };
    draw();
    const save = h('button', { class: 'btn btn-main' }, 'Save blook');
    save.addEventListener('click', busy(save, async () => {
      try { await progress.saveCustom(slot, customId(parts)); toast('Custom blook saved', 'ok'); close(); redraw(); } catch (err) { toast(err.message, 'bad'); }
    }));
    return [h('h2', {}, `Custom blook ${slot + 1}`), preview, rows,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'), save)];
  }, { wide: true });
}

/* ------------------------------------------------------------------ levels */

function roadmap() {
  const lvl = progress.levelOf(progress.me().xp);
  const items = [];
  for (let l = 1; l <= 12; l++) {
    const what = progress.unlocksAt(l);
    if (!what.length) continue;
    items.push(h('li', { class: l <= lvl ? 'is-done' : '' },
      h('span', { class: 'lv' }, String(l)),
      h('div', {}, ...what.map((t) => h('div', {}, t))),
      l <= lvl ? icon('check', { size: 18 }) : h('small', { class: 'muted' }, `${progress.xpFor(l)} XP`)));
  }
  return h('section', { class: 'stack' }, h('h2', {}, 'Levels'), h('ol', { class: 'roadmap' }, ...items));
}

/* -------------------------------------------------------------------- page */

export default async function Blooks() {
  pageTitle('Blooks');
  if (!signedIn()) {
    return h('div', { class: 'page mid' }, h('div', { class: 'card center stack', style: { justifyItems: 'center' } },
      h('div', { class: 'row', style: { justifyContent: 'center' } }, ...['dragon', 'unicorn', 'astronaut'].map((id) => blookCard(id))),
      h('h1', {}, 'Collect blooks'),
      h('p', { class: 'muted' }, 'Earn coins and XP by playing, open boxes for blooks from common to legendary, and build up to three custom blooks as you level up.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('a', { class: 'btn btn-main btn-lg', href: '/signup?next=/blooks' }, 'Sign up free'),
        h('a', { class: 'btn btn-lg', href: '/login?next=/blooks' }, 'Sign in'))));
  }
  await whenProfile();
  await myPlan();     // so Pro perks (all custom slots, flags) are known before drawing
  const root = h('div', { class: 'page stack', style: { gap: '18px' } });
  const TABS = [['shop', 'Shop', 'star'], ['collection', 'Collection', 'list'], ['custom', 'Custom', 'edit'], ['levels', 'Levels', 'trophy']];
  const body = h('div', { class: 'bk-body' });
  const tabs = h('div', { class: 'bk-tabs', role: 'tablist' });
  const drawBody = () => {
    fill(tabs, ...TABS.map(([id, label, ic]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(view.tab === id), class: view.tab === id ? 'is-on' : '', onclick: () => { view.tab = id; sfx('tap'); drawBody(); } }, icon(ic, { size: 16 }), label)));
    if (view.tab === 'shop') fill(body, boxes(draw));
    else if (view.tab === 'collection') {
      // typing in the search box keeps its focus
      const focused = document.activeElement && document.activeElement.classList.contains('bk-search');
      fill(body, catalog(drawBody));
      if (focused) { const el = body.querySelector('.bk-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    } else if (view.tab === 'custom') fill(body, customs(draw));
    else fill(body, roadmap());
  };
  const draw = () => {
    fill(root,
      h('div', { class: 'row spread' }, h('h1', { style: { margin: 0 } }, 'Blooks')),
      header(),
      tabs,
      body);
    drawBody();
  };
  draw();
  return root;
}
