// present.js — Quickzy Presentation+ (Pro): make slides, present them on
// the big screen, and let the audience vote, answer and guess on phones.

import { h, fill } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { toast, busy, empty, confirm } from '../ui/kit.js';
import { navigate } from '../router.js';
import { net, explain } from '../net/index.js';
import { me, signedIn } from '../services/session.js';
import { isPro, proOpen, PRO_COMING } from '../services/plan.js';
import * as D from '../services/decks.js';
import { celebrate } from '../ui/confetti.js';
import { sfx } from '../game/sound.js';
import { pageTitle } from './parts.js';
import NotFound from './notfound.js';
import { slideView, THEME_INFO, BGS, COLS } from './slides.js';
import { mainHost } from '../config.js';

async function proGate() {
  if (!signedIn()) { navigate('/login?next=/present'); return h('div'); }
  if (await isPro(me().uid)) return null;
  return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack pres-upsell' },
    h('div', { class: 'pres-badge' }, 'Presentation+'),
    h('h1', {}, 'Present like a pro'),
    h('p', { class: 'muted' }, 'Slides with live polls, quiz questions and guess-the-number graphs that your audience answers on their phones. Presentation+ is for Quickzy Pro members.'),
    proOpen() ? h('a', { class: 'btn btn-main btn-lg', href: '/pro' }, 'Start my free week of Pro') : h('p', { class: 'pill' }, PRO_COMING)));
}

export { slideView };

/* ------------------------------------------------- PowerPoint import */

/** A button that reads a .pptx file and hands back its slides. */
function importButton(label, onSlides, { main = false } = {}) {
  const file = h('input', { type: 'file', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', hidden: true });
  const btn = h('button', { class: `btn${main ? ' btn-lg' : ''}`, type: 'button', onclick: () => file.click() }, icon('download', { size: 18 }), label);
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const was = btn.innerHTML;
    btn.disabled = true;
    try {
      const { readPptx } = await import('../services/pptx.js');
      const res = await readPptx(f, { onProgress: (i, n) => { btn.textContent = `Reading slide ${i} of ${n}…`; } });
      await onSlides(res);
      sfx('win');
      toast(`Imported ${res.slides.length} slides. Now add polls, quizzes and guesses between them!`, 'ok');
    } catch (e) { toast(e.message || 'Could not read that file', 'bad'); }
    btn.disabled = false; btn.innerHTML = was;
  });
  return h('span', {}, btn, file);
}

/* ---------------------------------------------------- list and editor */

export default async function Present({ params }) {
  pageTitle('Presentation+');
  const gate = await proGate();
  if (gate) return gate;
  if (params.id) return editor(params.id);
  const decks = (await D.myDecks()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const create = h('button', { class: 'btn btn-main btn-lg' }, icon('plus', { size: 18 }), 'New presentation');
  create.addEventListener('click', busy(create, async () => {
    const id = await D.saveDeck({ title: 'My presentation', slides: [D.blank('title'), D.blank('content'), D.blank('two'), D.blank('quote'), D.blank('poll'), D.blank('quiz')] });
    navigate(`/present/${id}`);
  }));
  return h('div', { class: 'page stack', style: { gap: '18px' } },
    h('section', { class: 'pres-hero' },
      h('div', { class: 'pres-badge' }, 'Presentation+'),
      h('h1', {}, 'Slides that talk back'),
      h('p', {}, 'Bring your PowerPoint, then add live polls, quiz questions and guess-the-number graphs between the slides. Your audience joins with a PIN and answers on their phones.'),
      h('div', { class: 'row' }, importButton('Import PowerPoint (.pptx)', async ({ title, slides }) => {
        const id = await D.saveDeck({ title, slides });
        navigate(`/present/${id}`);
      }, { main: true }), create),
      h('small', { class: 'pres-note' }, 'Google Slides and Keynote: use File → Download / Export as .pptx.')),
    decks.length
      ? h('div', { class: 'pres-grid' }, ...decks.map((d) => h('a', { class: 'pres-card', href: `/present/${d.id}` },
        h('div', { class: 'pres-thumb' }, d.slides && d.slides[0] ? slideView(d.slides[0]) : null),
        h('b', {}, d.title), h('small', { class: 'muted' }, `${(d.slides || []).length} slides`))))
      : h('div', { class: 'card flat' }, empty('No presentations yet', 'Press "New presentation" to make your first one. It starts with one of every kind of slide.')));
}

/** A picture from the computer, made small enough to keep in the presentation. */
function pickPicture() {
  return new Promise((done) => {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) { done(''); return; }
      const img = new Image();
      img.onload = () => {
        // shrink until it fits (the presentation keeps up to ~90 KB a picture)
        for (const [w, q] of [[1280, 0.72], [1024, 0.66], [800, 0.6], [640, 0.55], [480, 0.5]]) {
          const k = Math.min(1, w / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', q);
          if (url.length < 120000) { done(url); return; }
        }
        toast('That picture is too big. Try a smaller one.', 'bad'); done('');
      };
      img.onerror = () => { toast('That file is not a picture.', 'bad'); done(''); };
      img.src = URL.createObjectURL(f);
    });
    document.body.append(file);
    file.click();
    setTimeout(() => file.remove(), 60000);
  });
}

async function editor(id) {
  const deck = await D.getDeck(id).catch(() => null);
  if (!deck || deck.owner !== me().uid) return NotFound();
  deck.id = id;
  deck.slides = deck.slides.map(D.cleanSlide);
  let cur = 0;
  let tab = 'home';
  let dirty = false;
  let saving = null;
  const status = h('span', { class: 'pp-status' }, 'All changes saved');
  const touch = () => { dirty = true; status.textContent = 'Editing…'; clearTimeout(saving); saving = setTimeout(autosave, 1500); };
  const autosave = async () => { try { status.textContent = 'Saving…'; await D.saveDeck(deck); dirty = false; status.textContent = 'All changes saved'; } catch { status.textContent = 'Not saved — check your connection'; } };

  const title = h('input', { class: 'pp-title', value: deck.title, maxlength: 80, 'aria-label': 'Presentation title' });
  title.addEventListener('input', () => { deck.title = title.value; touch(); });

  const rail = h('div', { class: 'pp-rail', 'aria-label': 'Slides' });
  const canvas = h('div', { class: 'pp-canvas' });
  const notes = h('textarea', { class: 'pp-notes', rows: 3, maxlength: 1000, placeholder: 'Click to add speaker notes (only you see these while presenting)' });
  notes.addEventListener('input', () => { deck.slides[cur].notes = notes.value; touch(); });
  const side = h('aside', { class: 'pp-side' });
  const ribbon = h('div', { class: 'pp-ribbon' });
  const tabs = h('div', { class: 'pp-tabs', role: 'tablist' });

  const slide = () => deck.slides[cur];
  const theme = () => slide().th;
  let railTimer = 0;
  const redrawRailSoon = () => { clearTimeout(railTimer); railTimer = setTimeout(drawRail, 250); };

  const drawRail = () => fill(rail, ...deck.slides.map((s, i) => {
    const b = h('button', { class: `pp-mini${i === cur ? ' is-on' : ''}`, draggable: 'true', onclick: () => { cur = i; draw(); }, 'aria-label': `Slide ${i + 1}` },
      h('span', { class: 'pp-n' }, String(i + 1), D.LIVE_KINDS.includes(s.t) ? h('i', { class: 'pp-live-dot', title: 'The audience answers this one' }) : null),
      h('div', { class: 'pres-thumb' }, slideView(s, { number: sectionNumber(i) })));
    // drag a slide to move it
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); b.classList.add('is-drag'); });
    b.addEventListener('dragend', () => b.classList.remove('is-drag'));
    b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('is-over'); });
    b.addEventListener('dragleave', () => b.classList.remove('is-over'));
    b.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isInteger(from) || from === i) return;
      const [m] = deck.slides.splice(from, 1);
      deck.slides.splice(i, 0, m); cur = i; touch(); draw();
    });
    return b;
  }), h('button', { class: 'pp-mini-add', onclick: () => addSlide(D.TEXT_KINDS.includes(slide().t) ? 'content' : slide().t) }, icon('plus', { size: 18 }), 'New slide'));

  const sectionNumber = (i) => deck.slides.slice(0, i + 1).filter((x) => x.t === 'section').length;
  const drawCanvas = () => {
    fill(canvas, slideView(slide(), { number: sectionNumber(cur), edit: (key, value) => { slide()[key] = value; touch(); redrawRailSoon(); } }));
    notes.value = slide().notes || '';
  };

  const addSlide = (t) => {
    if (deck.slides.length >= D.MAX_SLIDES) { toast(`A presentation can have ${D.MAX_SLIDES} slides`, 'bad'); return; }
    const s = D.blank(t, theme());
    s.fx = slide().fx;
    deck.slides.splice(cur + 1, 0, s); cur += 1; touch(); sfx('tap'); draw();
  };

  // the layout gallery: each layout drawn small, in this presentation's theme
  const layoutGallery = (onPick, kinds = D.KINDS.map((k) => k[0])) => h('div', { class: 'pp-gallery' },
    ...kinds.map((t) => { const k = D.KINDS.find((x) => x[0] === t); return h('button', { class: 'pp-g', onclick: () => onPick(t), title: k[1] },
      h('div', { class: 'pres-thumb' }, slideView({ ...D.blank(t, theme()) })), h('small', {}, k[1])); }));

  const big = (ic, label, onclick, { on = false, disabled = false } = {}) => h('button', { class: `pp-btn${on ? ' is-on' : ''}`, onclick, disabled }, icon(ic, { size: 20 }), h('span', {}, label));

  const drawRibbon = () => {
    fill(tabs, ...[['home', 'Home'], ['insert', 'Insert'], ['design', 'Design'], ['transitions', 'Transitions'], ['show', 'Slide Show']]
      .map(([id2, label]) => h('button', { role: 'tab', class: tab === id2 ? 'is-on' : '', 'aria-selected': String(tab === id2), onclick: () => { tab = id2; drawRibbon(); } }, label)));
    const s = slide();
    if (tab === 'home') {
      fill(ribbon,
        h('div', { class: 'pp-group' },
          h('div', { class: 'pp-drop' }, big('plus', 'New slide', (e) => e.currentTarget.parentElement.classList.toggle('is-open')),
            h('div', { class: 'pp-pop' }, h('b', {}, 'Choose a layout'), layoutGallery((t) => { addSlide(t); document.querySelector('.pp-drop')?.classList.remove('is-open'); }))),
          h('div', { class: 'pp-drop' }, big('list', 'Layout', (e) => e.currentTarget.parentElement.classList.toggle('is-open'), { disabled: !D.TEXT_KINDS.includes(s.t) }),
            h('div', { class: 'pp-pop' }, h('b', {}, 'Change this slide\'s layout'), layoutGallery((t) => { Object.assign(s, { ...D.blank(t, s.th), head: s.head, body: s.body, img: s.img, notes: s.notes, fx: s.fx, t }); touch(); draw(); }, D.TEXT_KINDS))),
          h('small', {}, 'Slides')),
        h('div', { class: 'pp-group' },
          big('copy', 'Duplicate', () => { if (deck.slides.length >= D.MAX_SLIDES) return; deck.slides.splice(cur + 1, 0, JSON.parse(JSON.stringify(s))); cur += 1; touch(); draw(); }),
          big('up', 'Move up', () => { [deck.slides[cur - 1], deck.slides[cur]] = [deck.slides[cur], deck.slides[cur - 1]]; cur -= 1; touch(); draw(); }, { disabled: cur === 0 }),
          big('down', 'Move down', () => { [deck.slides[cur + 1], deck.slides[cur]] = [deck.slides[cur], deck.slides[cur + 1]]; cur += 1; touch(); draw(); }, { disabled: cur === deck.slides.length - 1 }),
          big('trash', 'Delete', () => { if (deck.slides.length < 2) return; deck.slides.splice(cur, 1); cur = Math.max(0, cur - 1); touch(); draw(); }, { disabled: deck.slides.length < 2 }),
          h('small', {}, 'Arrange')));
    } else if (tab === 'insert') {
      fill(ribbon,
        h('div', { class: 'pp-group' },
          big('camera', 'Picture', async () => {
            const url = await pickPicture();
            if (!url) return;
            if (D.TEXT_KINDS.includes(s.t) && s.t !== 'two') { s.img = url; if (s.t === 'title' || s.t === 'section' || s.t === 'quote' || s.t === 'big') s.t = 'content'; }
            else { const n = D.blank('image', theme()); n.img = url; deck.slides.splice(cur + 1, 0, n); cur += 1; }
            touch(); draw();
          }),
          big('globe', 'Picture link', () => {
            const url = prompt('Paste a picture link (https://…)');
            if (!url || !/^https:\/\/\S{8,290}$/.test(url.trim())) return;
            if (D.TEXT_KINDS.includes(s.t) && s.t !== 'two') { s.img = url.trim(); if (!['content', 'image'].includes(s.t)) s.t = 'content'; } else { const n = D.blank('image', theme()); n.img = url.trim(); deck.slides.splice(cur + 1, 0, n); cur += 1; }
            touch(); draw();
          }),
          s.img ? big('trash', 'Remove picture', () => { s.img = ''; touch(); draw(); }) : null,
          h('small', {}, 'Pictures')),
        h('div', { class: 'pp-group' },
          big('chart', 'Live poll', () => addSlide('poll')),
          big('check', 'Quiz question', () => addSlide('quiz')),
          big('toggle', 'Guess the number', () => addSlide('guess')),
          h('small', {}, 'Audience answers on phones')),
        h('div', { class: 'pp-group' },
          importButton('From PowerPoint', ({ slides }) => {
            const room = D.MAX_SLIDES - deck.slides.length;
            deck.slides.splice(cur + 1, 0, ...slides.slice(0, room).map((x) => ({ ...D.cleanSlide(x), th: x.img && !x.head ? 'quickzy' : theme() })));
            cur += 1; touch(); draw();
          }),
          h('small', {}, 'Import')));
    } else if (tab === 'design') {
      fill(ribbon,
        h('div', { class: 'pp-group pp-themes' },
          ...Object.entries(THEME_INFO).map(([k, info]) => h('button', { class: `pp-theme${theme() === k ? ' is-on' : ''}`, title: info.name, onclick: () => { deck.slides.forEach((x) => { x.th = k; }); touch(); sfx('pick'); draw(); } },
            h('div', { class: 'pres-thumb' }, slideView({ t: 'title', th: k, head: 'Aa', body: info.name, bg: s.bg || 0 })), h('small', {}, info.name))),
          h('small', {}, 'Themes (the whole presentation)')),
        theme() === 'quickzy' ? h('div', { class: 'pp-group' },
          h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', maxWidth: '180px' } }, ...BGS.map((bg, i) => h('button', { class: `pres-bg${(s.bg || 0) === i ? ' is-on' : ''}`, style: { background: bg }, 'aria-label': `Colour ${i + 1}`, onclick: () => { s.bg = i; touch(); draw(); } }))),
          h('small', {}, 'Colour (this slide)')) : null);
    } else if (tab === 'transitions') {
      const FX = [['none', 'None'], ['fade', 'Fade'], ['push', 'Push'], ['zoom', 'Zoom'], ['flip', 'Flip']];
      fill(ribbon,
        h('div', { class: 'pp-group' }, ...FX.map(([k, label]) => h('button', { class: `pp-fx${s.fx === k ? ' is-on' : ''}`, onclick: () => { s.fx = k; touch(); drawRibbon(); preview(k); } }, h('span', { class: `pp-fx-art fx-${k}` }, h('i'), h('i')), h('small', {}, label))),
          h('small', {}, 'How this slide comes in')),
        h('div', { class: 'pp-group' }, big('copy', 'Apply to all', () => { deck.slides.forEach((x) => { x.fx = s.fx; }); touch(); toast('Every slide uses this transition', 'ok'); }), h('small', {}, 'Timing')));
    } else {
      fill(ribbon,
        h('div', { class: 'pp-group' },
          big('play', 'From beginning', () => startShow(0)),
          big('skip', 'From this slide', () => startShow(cur)),
          h('small', {}, 'Start')),
        h('div', { class: 'pp-group' },
          h('p', { class: 'pp-help' }, 'While presenting: ← → to move, B for a black screen, N for your notes, F for full screen. Your audience joins at ', h('b', {}, mainHost()), ' with the PIN on screen.'),
          h('small', {}, 'Tips')));
    }
    drawSide();
  };

  // a quick look at the transition on the slide being edited
  const preview = (k) => { const el = canvas.firstElementChild; if (!el || k === 'none') return; el.classList.remove(`fx-in-${k}`); void el.offsetWidth; el.classList.add(`fx-in-${k}`); };

  // the panel beside the slide: what a live slide asks, and its answers
  const drawSide = () => {
    const s = slide();
    if (!D.LIVE_KINDS.includes(s.t)) {
      fill(side, h('div', { class: 'pp-side-card' },
        h('b', {}, D.KINDS.find((k) => k[0] === s.t)[1]),
        h('p', { class: 'muted small' }, 'Click any text on the slide to change it. Use Insert for pictures and live questions, and Design for the look.')));
      return;
    }
    const opt = () => h('div', { class: 'stack', style: { gap: '6px' } }, ...s.opts.map((o, i) => h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
      h('i', { class: 'pp-swatch', style: { background: COLS[i % 6] } }),
      (() => { const e = h('input', { class: 'input', value: o, maxlength: 60, 'aria-label': `Answer ${i + 1}` }); e.addEventListener('input', () => { s.opts[i] = e.value; touch(); drawCanvasSoon(); }); return e; })(),
      s.t === 'quiz' ? h('button', { class: `btn btn-sm${s.ans === i ? ' btn-ok' : ''}`, title: 'The right answer', 'aria-label': 'Mark as right', onclick: () => { s.ans = i; touch(); drawSide(); drawCanvas(); } }, icon('check', { size: 14 })) : null,
      s.opts.length > 2 ? h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove', onclick: () => { s.opts.splice(i, 1); if (s.ans >= s.opts.length) s.ans = 0; touch(); drawSide(); drawCanvas(); } }, icon('trash', { size: 14 })) : null)),
    s.opts.length < 6 ? h('button', { class: 'btn btn-sm', onclick: () => { s.opts.push(`Option ${s.opts.length + 1}`); touch(); drawSide(); drawCanvas(); } }, icon('plus', { size: 14 }), 'Add an answer') : null);
    const num = (key, label, extra = {}) => { const e = h('input', { class: 'input', type: extra.type || 'number', value: s[key] ?? '', ...extra }); e.addEventListener('input', () => { s[key] = extra.type ? e.value : Number(e.value); touch(); drawCanvasSoon(); }); return h('label', { class: 'field grow' }, h('span', {}, label), e); };
    fill(side, h('div', { class: 'pp-side-card stack' },
      h('b', {}, D.KINDS.find((k) => k[0] === s.t)[1]),
      h('p', { class: 'muted small', style: { margin: 0 } }, s.t === 'guess' ? 'Everyone slides to a number. A graph shows how close the room was.' : s.t === 'quiz' ? 'Tick the right answer. You reveal it when everyone has answered.' : 'Everyone picks one. The bars grow as votes come in.'),
      s.t === 'guess' ? h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'row' }, num('min', 'From'), num('max', 'To')), h('div', { class: 'row' }, num('ans', 'Answer'), num('unit', 'Unit', { type: 'text', maxlength: 12, placeholder: 'km…' }))) : opt()));
  };
  let canvasTimer = 0;
  const drawCanvasSoon = () => { clearTimeout(canvasTimer); canvasTimer = setTimeout(() => { drawCanvas(); drawRail(); }, 300); };

  const foot = h('footer', { class: 'pp-foot' });
  const draw = () => { drawRail(); drawCanvas(); drawRibbon(); fill(foot, h('span', {}, `Slide ${cur + 1} of ${deck.slides.length}`), h('span', {}, `Theme: ${THEME_INFO[theme()].name}`), h('span', {}, 'Drag slides to reorder')); };
  const startShow = async (from) => { clearTimeout(saving); try { await D.saveDeck(deck); dirty = false; navigate(`/present/${id}/live?from=${from}`); } catch (e) { toast(explain(e), 'bad'); } };

  // keyboard: up/down moves between slides when not typing
  const keys = (e) => {
    if (!rail.isConnected) { window.removeEventListener('keydown', keys); return; }
    const typing = e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName);
    if (typing) return;
    if (e.key === 'ArrowDown' && cur < deck.slides.length - 1) { cur += 1; draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp' && cur > 0) { cur -= 1; draw(); e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && deck.slides.length > 1 && document.activeElement?.classList.contains('pp-mini')) { deck.slides.splice(cur, 1); cur = Math.max(0, cur - 1); touch(); draw(); }
  };
  window.addEventListener('keydown', keys);
  // close the layout menus when clicking elsewhere
  document.addEventListener('click', (e) => { if (!e.target.closest('.pp-drop')) document.querySelectorAll('.pp-drop.is-open').forEach((d) => d.classList.remove('is-open')); });
  draw();

  const delBtn = h('button', { class: 'btn btn-ghost btn-sm' }, icon('trash', { size: 16 }), 'Delete');
  delBtn.addEventListener('click', async () => {
    if (!(await confirm({ title: 'Delete this presentation?', yes: 'Delete', danger: true }))) return;
    await D.removeDeck(id).catch(() => {}); navigate('/present');
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); }, { once: true });
  return {
    el: h('div', { class: 'pp' },
      h('header', { class: 'pp-top' },
        h('a', { class: 'pp-back', href: '/present', 'aria-label': 'All presentations' }, h('span', { class: 'pp-logo' }, 'P+')),
        h('div', { class: 'pp-name' }, title, status),
        h('div', { class: 'grow' }),
        delBtn,
        h('button', { class: 'btn btn-main', onclick: () => startShow(cur) }, icon('play', { size: 16 }), 'Present')),
      tabs, ribbon,
      h('div', { class: 'pp-body' },
        rail,
        h('main', { class: 'pp-main' }, h('div', { class: 'pp-canvas-wrap' }, canvas), notes),
        side),
      foot),
    destroy() { window.removeEventListener('keydown', keys); if (dirty) D.saveDeck(deck).catch(() => {}); },
  };
}

/* ------------------------------------------------------- presenting */

export async function PresentLive({ params, query = {} }) {
  const gate = await proGate();
  if (gate) return gate;
  const deck = await D.getDeck(params.id).catch(() => null);
  if (!deck || deck.owner !== me().uid || !deck.slides.length) return NotFound();
  pageTitle(deck.title);
  deck.id = params.id;
  deck.slides = deck.slides.map(D.cleanSlide);
  const pin = await D.startShow(deck);
  let i = -1;
  let reveal = false;
  let votes = {};
  let off = () => {};
  let dir = 1;
  const stage = h('div', { class: 'pres-stage' });
  const counter = h('span', { class: 'pres-count' });
  const bar = h('i');
  const notesBox = h('div', { class: 'pres-notes', hidden: true });
  const black = h('div', { class: 'pres-black', hidden: true, onclick: () => { black.hidden = true; } });
  const revealBtn = h('button', { class: 'btn btn-main' }, 'Reveal answer');
  const sectionNumber = (k) => deck.slides.slice(0, k + 1).filter((x) => x.t === 'section').length;
  const draw = (animate = false) => {
    const s = deck.slides[i];
    const el = slideView(s, { votes, reveal, pin: D.LIVE_KINDS.includes(s.t) || i === 0 ? pin : '', count: Object.keys(votes).length, number: sectionNumber(i) });
    if (animate && s.fx && s.fx !== 'none') el.classList.add(`fx-in-${s.fx}`, dir < 0 ? 'fx-back' : 'fx-fwd');
    fill(stage, el);
    counter.textContent = `${i + 1} / ${deck.slides.length}`;
    bar.style.width = `${((i + 1) / deck.slides.length) * 100}%`;
    fill(notesBox, h('small', {}, 'Your notes'), h('p', {}, s.notes || 'No notes for this slide.'), deck.slides[i + 1] ? h('small', {}, `Next: ${deck.slides[i + 1].head || 'slide ' + (i + 2)}`) : h('small', {}, 'This is the last slide'));
    revealBtn.hidden = !['quiz', 'guess'].includes(s.t) || reveal;
  };
  const go = async (k) => {
    const next = Math.max(0, Math.min(deck.slides.length - 1, k));
    if (next === i) return;
    dir = next > i ? 1 : -1;
    i = next;
    reveal = false; votes = {};
    off(); off = D.onVotes(pin, i, (v) => { votes = v; draw(); });
    draw(true);
    sfx('tap');
    await D.showSlide(pin, i, deck.slides[i], false).catch(() => {});
  };
  revealBtn.addEventListener('click', async () => { reveal = true; await D.showSlide(pin, i, deck.slides[i], true).catch(() => {}); sfx('win'); celebrate(); draw(); });
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  const key = (e) => {
    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); go(i + 1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(deck.slides.length - 1);
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') black.hidden = !black.hidden;
    else if (e.key === 'n' || e.key === 'N') notesBox.hidden = !notesBox.hidden;
    else if (e.key === 'f' || e.key === 'F') full();
    else if (e.key === 'Escape' && !document.fullscreenElement) end();
  };
  window.addEventListener('keydown', key);
  // click the slide to go on, like PowerPoint
  stage.addEventListener('click', (e) => { if (!e.target.closest('button, input, a')) go(i + 1); });
  let ended = false;
  const end = async () => { if (ended) return; ended = true; window.removeEventListener('keydown', key); off(); await D.endShow(pin); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); navigate(`/present/${deck.id}`); };
  go(Math.max(0, Math.min(deck.slides.length - 1, Number(query.from) || 0)));
  return {
    el: h('div', { class: 'pres-live' },
      stage, black, notesBox,
      h('div', { class: 'pres-progress' }, bar),
      h('div', { class: 'pres-controls' },
        h('button', { class: 'btn', onclick: () => go(i - 1), 'aria-label': 'Previous slide' }, icon('arrowLeft', { size: 18 })),
        counter,
        h('button', { class: 'btn', onclick: () => go(i + 1), 'aria-label': 'Next slide' }, icon('arrowRight', { size: 18 })),
        revealBtn,
        h('button', { class: 'btn btn-ghost', onclick: () => { notesBox.hidden = !notesBox.hidden; } }, 'Notes'),
        h('button', { class: 'btn btn-ghost', onclick: () => { black.hidden = false; } }, 'Black screen'),
        h('button', { class: 'btn btn-ghost', onclick: full }, 'Full screen'),
        h('span', { class: 'pres-pin' }, `PIN ${pin.slice(0, 3)} ${pin.slice(3)}`),
        h('button', { class: 'btn btn-ghost', onclick: end }, 'End show'))),
    destroy() { if (!ended) { ended = true; window.removeEventListener('keydown', key); off(); D.endShow(pin); } },
  };
}

/* --------------------------------------------------------- audience */

export async function Audience({ params }) {
  const pin = String(params.pin || '').replace(/\D/g, '');
  if (!me()) { try { await net.auth.anon(); } catch (e) { return h('div', { class: 'page narrow' }, h('p', {}, explain(e))); } }
  const meta = await D.showMeta(pin).catch(() => null);
  if (!meta) return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' }, h('h2', {}, 'No presentation with that PIN'), h('a', { class: 'btn btn-main', href: '/join' }, 'Try again')));
  pageTitle(meta.title);
  const box = h('div', { class: 'aud-box' });
  let mine = null;
  let last = -1;
  const draw = (cur) => {
    if (!cur) { fill(box, h('h2', {}, 'Waiting for the presenter…'), blook('owl', 96)); return; }
    const s = cur.s;
    if (cur.i !== last) { mine = null; last = cur.i; }
    const voteBtn = (v, label, col) => h('button', { class: `aud-opt${mine === v ? ' is-mine' : ''}${cur.reveal && s.t === 'quiz' ? (v === s.ans ? ' is-right' : ' is-wrong') : ''}`, style: { background: col }, disabled: mine !== null,
      onclick: async () => { mine = v; sfx('pick'); draw(cur); await D.vote(pin, cur.i, v).catch(() => {}); } }, label);
    if (s.t === 'poll' || s.t === 'quiz') {
      fill(box, h('h2', {}, s.head), h('div', { class: 'aud-opts' }, ...s.opts.map((o, k) => voteBtn(k, o, COLS[k % 6]))),
        mine !== null ? h('p', { class: 'aud-sent' }, cur.reveal && s.t === 'quiz' ? (mine === s.ans ? 'Correct! 🎉' : 'Not this time') : 'Sent! Look at the big screen.') : null);
      if (cur.reveal && s.t === 'quiz' && mine === s.ans) celebrate();
    } else if (s.t === 'guess') {
      const out = h('b', { class: 'aud-num' }, String(Math.round((s.min + s.max) / 2)));
      const slider = h('input', { type: 'range', min: s.min, max: s.max, step: (s.max - s.min) > 50 ? 1 : 0.1, value: (s.min + s.max) / 2, class: 'aud-range', disabled: mine !== null });
      slider.addEventListener('input', () => { out.textContent = slider.value; });
      const send = h('button', { class: 'btn btn-main btn-lg', disabled: mine !== null, onclick: async () => { mine = Number(slider.value); sfx('pick'); await D.vote(pin, cur.i, mine).catch(() => {}); draw(cur); } }, 'Lock in my guess');
      fill(box, h('h2', {}, s.head), out, slider, h('div', { class: 'row spread' }, h('small', {}, `${s.min}`), h('small', {}, `${s.max} ${s.unit || ''}`)),
        mine === null ? send : h('p', { class: 'aud-sent' }, cur.reveal ? `The answer: ${s.ans} ${s.unit || ''}. You guessed ${mine}.` : `You guessed ${mine}. Look at the big screen!`));
    } else {
      fill(box, h('div', { class: 'aud-look' }, logo(), h('h2', {}, s.head), h('p', {}, 'Look at the big screen')));
    }
  };
  const off = D.onCurrent(pin, draw);
  const root = h('div', { class: 'aud' }, h('div', { class: 'aud-top' }, h('b', {}, meta.title), h('span', { class: 'pres-badge' }, 'Presentation+')), box);
  return { el: root, destroy: off };
}
