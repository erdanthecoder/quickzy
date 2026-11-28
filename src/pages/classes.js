// classes.js — /classes: the classes you teach or are in, join one with a
// code, or (teachers) make one. /class/:id: one class: its announcements,
// game codes, homework and one-question quizzes, and the people in it.

import { h, fill, ago, plural } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { modal, toast, busy, empty, confirm, copy } from '../ui/kit.js';
import { navigate } from '../router.js';
import { proOpen } from '../services/plan.js';
import * as session from '../services/session.js';
import * as cls from '../services/classes.js';
import * as hw from '../services/homework.js';
import { myQuizzes } from '../services/quizzes.js';
import { pageTitle } from './parts.js';
import NotFound from './notfound.js';
import { mainHost } from '../config.js';

export const CLASS_COLORS = ['#6b4cff', '#ff4772', '#12c9a6', '#ff8a2a', '#2f9bff', '#a560ff', '#ffb21f', '#0fb5d6'];
const colorOf = (c) => CLASS_COLORS[(c && c.color) | 0] || CLASS_COLORS[0];
const due = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Type a class code and join. */
export function joinClassBox({ compact = false } = {}) {
  const code = h('input', { class: 'input cl-code-input', maxlength: 10, placeholder: 'Class code', autocomplete: 'off', 'aria-label': 'Class code' });
  code.addEventListener('input', () => { code.value = cls.cleanCode(code.value); code.classList.remove('is-bad'); });
  const go = h('button', { class: 'btn btn-main' }, 'Join');
  const submit = busy(go, async () => {
    if (!session.signedIn()) { navigate('/signup?next=/classes'); return; }
    if (code.value.length < 4) { code.classList.add('is-bad'); code.focus(); return; }
    try {
      const cid = await cls.join(code.value);
      toast('You joined the class!', 'ok');
      navigate(`/class/${cid}`);
    } catch (e) { toast(e.message, 'bad'); }
  });
  go.addEventListener('click', submit);
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div', { class: `cls-join${compact ? ' is-compact' : ''}` },
    compact ? null : h('span', { class: 'cls-join-ic' }, icon('key', { size: 22 })),
    compact ? null : h('div', {}, h('b', {}, 'Got a class code?'), h('small', { class: 'muted' }, 'Your teacher gives it to you.')),
    h('div', { class: 'row cls-join-row' }, code, go));
}

function classCard(c) {
  const teacher = cls.teaches(c);
  return h('a', { class: 'cls-card', href: `/class/${c.id}`, style: { '--cls': colorOf(c) } },
    h('div', { class: 'cls-card-top' },
      h('span', { class: 'cls-initial' }, (c.name || '?').trim().charAt(0).toUpperCase()),
      teacher ? h('span', { class: 'cls-card-code' }, icon('key', { size: 12 }), c.code) : null,
      h('b', {}, c.name), h('small', {}, c.school || c.ownerName)),
    h('div', { class: 'cls-card-end' },
      h('span', {}, icon('users', { size: 16 }), plural((c.members || []).length, 'student')),
      teacher ? h('span', { class: 'cls-role' }, 'Teacher') : h('span', { class: 'muted small' }, c.ownerName)));
}

/** Make a class (teachers). */
export function newClassDialog() {
  return modal((close) => {
    let color = Math.floor(Math.random() * CLASS_COLORS.length);
    const name = h('input', { class: 'input', maxlength: 60, placeholder: 'For example: Grade 5B Maths' });
    const school = h('input', { class: 'input', maxlength: 80, value: (session.myProfile() || {}).school || '' });
    const code = h('input', { class: 'input cl-code-input', maxlength: 10, placeholder: 'Leave empty for a random code' });
    code.addEventListener('input', () => { code.value = cls.cleanCode(code.value); });
    const colors = h('div', { class: 'row cls-colors' });
    const drawColors = () => fill(colors, ...CLASS_COLORS.map((c, i) => h('button', { type: 'button', class: `cls-color${i === color ? ' is-on' : ''}`, style: { background: c }, 'aria-label': `Colour ${i + 1}`, onclick: () => { color = i; drawColors(); } })));
    drawColors();
    const go = h('button', { class: 'btn btn-main' }, icon('plus', { size: 16 }), 'Make class');
    go.addEventListener('click', busy(go, async () => {
      try { const cid = await cls.createClass({ name: name.value, school: school.value, code: code.value, color }); close(cid); } catch (e) {
        toast(e.message, 'bad');
        if (e.pro && proOpen()) { close(); navigate('/pro'); }
      }
    }));
    return [h('h2', {}, 'New class'),
      h('label', { class: 'field' }, h('span', {}, 'Class name'), name),
      h('label', { class: 'field' }, h('span', {}, 'School'), school),
      h('label', { class: 'field' }, h('span', {}, 'Class code'), code, h('small', { class: 'muted' }, 'Students type this to join. 4 to 10 letters or numbers.')),
      h('div', { class: 'field' }, h('span', {}, 'Colour'), colors),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'), go)];
  }).then((cid) => { if (cid) navigate(`/class/${cid}`); return cid; });
}

export default async function Classes({ query }) {
  pageTitle('Classes');
  if (!session.signedIn()) { navigate('/login?next=/classes', { replace: true }); return h('div'); }
  await session.whenProfile();
  if (!cls.classesOpen()) {
    return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' },
      blook('owl', 80), h('h2', {}, 'Classes arrive with Quickzy 1.4'), h('p', { class: 'muted' }, 'Today at 12:00 PM. See you there!')));
  }
  const teach = cls.canTeach();
  const [list, pro] = await Promise.all([cls.myClasses(), import('../services/plan.js').then((m) => m.isPro(session.me().uid)).catch(() => false)]);
  const mine = list.filter(cls.teaches);
  const joined = list.filter((c) => !cls.teaches(c));
  if (teach && query.new) setTimeout(() => newClassDialog(), 200);
  const p = session.myProfile() || {};
  const students = mine.reduce((n, k) => n + (k.members || []).length, 0);
  const newTile = () => h('button', { type: 'button', class: 'cls-new-tile', onclick: () => newClassDialog() },
    h('span', {}, icon('plus', { size: 26 })), h('b', {}, 'New class'), h('small', {}, pro ? `${mine.length} of 50` : `${mine.length} of 2 free`));
  return h('div', { class: 'page stack', style: { gap: '22px' } },
    h('section', { class: 'cls-hero' },
      h('div', { class: 'cls-hero-art', 'aria-hidden': 'true' },
        h('span', { class: 'cls-board' }, h('i'), h('i'), h('i')),
        ...['owl', 'fox', 'unicorn', 'panda', 'robot'].map((id, i) => h('span', { class: 'cls-kid', style: { '--i': i } }, blook(id, i === 0 ? 70 : 46)))),
      h('div', { class: 'grow cls-hero-copy' },
        h('span', { class: 'pill' }, icon(teach ? 'book' : 'users', { size: 14 }), teach ? `Teacher${p.school ? ` · ${p.school}` : ''}` : 'Classes'),
        h('h1', {}, teach ? 'Your classroom' : 'Your classes'),
        h('p', {}, teach
          ? `Make a class, give students its code, then post announcements, game PINs, homework and quick questions. ${pro ? 'Pro: up to 50 classes of 300 students.' : 'Free: 2 classes of up to 100 students. Quickzy Pro: up to 50 classes of 300.'}`
          : 'Join your class with the code your teacher gives you. Announcements, games and homework show up here.'),
        teach ? h('div', { class: 'cls-hero-stats' },
          h('span', {}, h('b', {}, String(mine.length)), plural(mine.length, 'class', 'classes').replace(/^\d+ /, '')),
          h('span', {}, h('b', {}, String(students)), plural(students, 'student').replace(/^\d+ /, '')),
          h('span', {}, h('b', {}, pro ? 'Pro' : 'Free'), pro ? '50 classes' : '2 classes')) : null,
        teach ? h('button', { class: 'btn btn-main btn-lg', onclick: () => newClassDialog() }, icon('plus', { size: 18 }), 'New class') : null)),
    joinClassBox(),
    teach ? h('section', { class: 'stack' },
      h('h2', {}, 'Classes you teach'),
      mine.length ? h('div', { class: 'cls-grid' }, ...mine.map(classCard), newTile())
        : h('div', { class: 'card flat' }, empty('No classes yet', 'Make your first class. It takes ten seconds.', h('button', { class: 'btn btn-main', onclick: () => newClassDialog() }, icon('plus', { size: 16 }), 'New class')))) : null,
    joined.length || !teach ? h('section', { class: 'stack' },
      h('h2', {}, teach ? 'Classes you are in' : 'Your classes'),
      joined.length ? h('div', { class: 'cls-grid' }, ...joined.map(classCard))
        : h('div', { class: 'card flat' }, empty('You are not in a class yet', 'Ask your teacher for the class code and type it above.'))) : null);
}

/* ================================================================ one class */

export async function ClassPage({ params }) {
  if (!session.signedIn()) { navigate(`/login?next=/class/${params.id}`, { replace: true }); return h('div'); }
  await session.whenProfile();
  let c = await cls.getClass(params.id);
  if (!c) return NotFound();
  pageTitle(c.name);
  if (!cls.inClass(c)) {
    return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' },
      blook('owl', 72), h('h2', {}, c.name), h('p', { class: 'muted' }, `${c.ownerName}${c.school ? ` · ${c.school}` : ''}`),
      h('p', {}, 'Type the class code to join.'), joinClassBox({ compact: true })));
  }
  const teacher = cls.teaches(c);
  const stream = h('div', { class: 'stack cls-stream' });
  const side = h('div', { class: `stack cls-side${teacher ? ' is-teacher' : ''}` });
  const reload = async () => { c = (await cls.getClass(c.id)) || c; };

  async function drawStream() {
    const rows = await cls.posts(c.id);
    if (!rows.length) {
      fill(stream, h('div', { class: 'card cls-empty' }, blook(teacher ? 'owl' : 'panda', 72),
        h('b', {}, teacher ? 'Post your first announcement' : 'Nothing here yet'),
        h('p', { class: 'muted' }, teacher ? 'Say hello, send a game PIN, set homework or ask a quick question.' : 'Your teacher has not posted anything yet. Check back soon!')));
      return;
    }
    // pinned posts first, then the newest
    rows.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.at || 0) - (a.at || 0));
    fill(stream, ...rows.map(postCard));
  }

  /** The reaction bar under a post: tap one, tap again to take it back. */
  function reactBar(p) {
    const bar = h('div', { class: 'cls-react' });
    let rows = [];
    const draw = () => {
      const mine = (rows.find((r) => r.id === session.me().uid) || {}).e;
      fill(bar, ...cls.REACTIONS.map(([k, pic]) => {
        const n = rows.filter((r) => r.e === k).length;
        const b = h('button', { type: 'button', class: `cls-react-btn${mine === k ? ' is-on' : ''}${n ? ' has' : ''}`, 'aria-label': `React ${k}` }, h('span', {}, pic), n ? h('b', {}, String(n)) : null);
        b.addEventListener('click', async () => {
          b.classList.add('is-pop');
          try {
            const e = await cls.react(c.id, p.id, k);
            rows = rows.filter((r) => r.id !== session.me().uid);
            if (e) rows.push({ id: session.me().uid, e });
            draw();
          } catch { toast('Could not react', 'bad'); }
        });
        return b;
      }));
    };
    cls.reactions(c.id, p.id).then((r) => { rows = r; draw(); });
    draw();
    return bar;
  }

  function postCard(p) {
    const del = teacher ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Delete', 'aria-label': 'Delete', onclick: async () => {
      if (!(await confirm({ title: 'Delete this post?', yes: 'Delete', danger: true }))) return;
      await cls.deletePost(c.id, p.id).catch(() => {}); drawStream();
    } }, icon('trash', { size: 16 })) : null;
    const kind = { note: ['info', 'Announcement'], game: ['play', 'Live game'], homework: ['book', 'Homework'], question: ['hash', 'Quick question'] }[p.kind] || ['info', 'Post'];
    const body = [];
    if (p.text && p.kind !== 'question') body.push(h('p', { class: 'cls-text' }, p.text));
    if (p.kind === 'game') {
      body.push(h('div', { class: 'cls-game' },
        h('div', {}, h('small', {}, p.title || 'Live game'), h('b', {}, `${p.pin.slice(0, 3)} ${p.pin.slice(3)}`)),
        h('a', { class: 'btn btn-main', href: `/join/${p.pin}` }, icon('play', { size: 16 }), 'Join game')));
    }
    if (p.kind === 'homework') {
      const open = p.dueAt > Date.now();
      body.push(h('a', { class: 'cls-hw', href: `/hw/${p.hwId}` },
        h('span', { class: 'cls-hw-ic' }, icon('book', { size: 20 })),
        h('div', { class: 'grow' }, h('b', {}, p.title), h('small', { class: 'muted' }, open ? `Due ${due(p.dueAt)}` : 'Closed')),
        h('span', { class: 'btn btn-sm' }, teacher ? 'See results' : open ? 'Start' : 'Open')));
    }
    if (p.kind === 'question') body.push(questionBox(p));
    const pin = teacher ? h('button', { class: `btn btn-ghost btn-sm btn-icon${p.pinned ? ' is-pinned' : ''}`, title: p.pinned ? 'Unpin' : 'Pin to the top', 'aria-label': p.pinned ? 'Unpin' : 'Pin to the top', onclick: async () => {
      await cls.pinPost(c.id, p.id, !p.pinned).catch(() => toast('Could not pin', 'bad')); drawStream();
    } }, '\u{1F4CC}') : null;
    return h('article', { class: `card cls-post is-${p.kind}${p.pinned ? ' is-pinned' : ''}` },
      h('div', { class: 'cls-post-head' },
        h('span', { class: 'cls-post-ic' }, icon(kind[0], { size: 16 })),
        h('div', { class: 'grow' }, h('b', {}, p.byName), h('small', { class: 'muted' }, `${p.pinned ? 'Pinned \u00b7 ' : ''}${kind[1]} · ${p.at ? ago(p.at) : 'just now'}`)),
        pin, del),
      ...body,
      reactBar(p));
  }

  function questionBox(p) {
    const el = h('div', { class: 'cls-q' }, h('b', { class: 'cls-q-text' }, p.text));
    const opts = h('div', { class: 'cls-q-opts' });
    el.append(opts);
    const shapes = ['#ff4772', '#2f9bff', '#ffb21f', '#12c9a6'];
    if (teacher) {
      cls.answers(c.id, p.id).then((rows) => {
        const counts = p.options.map((_, i) => rows.filter((r) => r.choice === i).length);
        const total = rows.length || 1;
        fill(opts, ...p.options.map((o, i) => h('div', { class: `cls-q-bar${i === p.answer ? ' is-right' : ''}` },
          h('i', { style: { width: `${Math.round((counts[i] / total) * 100)}%`, background: shapes[i] } }),
          h('span', {}, i === p.answer ? icon('check', { size: 14 }) : null, o), h('b', {}, String(counts[i])))));
        const right = rows.filter((r) => r.choice === p.answer);
        el.append(h('details', { class: 'cls-q-who' },
          h('summary', {}, `${plural(rows.length, 'answer')} · ${right.length} right`),
          h('ul', {}, ...rows.map((r) => h('li', { class: r.choice === p.answer ? 'is-right' : 'is-wrong' }, icon(r.choice === p.answer ? 'check' : 'close', { size: 14 }), r.name, h('small', { class: 'muted' }, p.options[r.choice] || ''))))));
      });
      return el;
    }
    const draw = (mine) => fill(opts, ...p.options.map((o, i) => {
      const cls2 = mine ? (i === p.answer ? ' is-right' : i === mine.choice ? ' is-wrong' : ' is-dim') : '';
      return h('button', { type: 'button', class: `cls-q-opt${cls2}`, style: { '--q': shapes[i] }, disabled: Boolean(mine), onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await cls.answer(c.id, p.id, i);
          const ok = i === p.answer;
          toast(ok ? 'Right!' : 'Not quite', ok ? 'ok' : 'bad');
          import('../game/sound.js').then((m) => m.sfx(ok ? 'right' : 'wrong')).catch(() => {});
          draw({ choice: i });
        } catch { toast('You already answered', 'bad'); draw(await cls.myAnswer(c.id, p.id)); }
      } }, o);
    }));
    cls.myAnswer(c.id, p.id).then(draw);
    return el;
  }

  /* ---------------------------------------------------- the teacher's composer */
  function composer() {
    let kind = 'note';
    const tabs = h('div', { class: 'cls-tabs' });
    const area = h('div', { class: 'stack', style: { gap: '10px' } });
    const drawTabs = () => fill(tabs, ...[['note', 'info', 'Announcement'], ['game', 'play', 'Game PIN'], ['homework', 'book', 'Homework'], ['question', 'hash', 'Quick question']]
      .map(([k, ic, label]) => h('button', { type: 'button', class: `chip${k === kind ? ' is-on' : ''}`, onclick: () => { kind = k; drawTabs(); drawArea(); } }, icon(ic, { size: 14 }), label)));
    const post = (fields) => async () => {
      try { await cls.post(c.id, kind, fields()); toast('Posted!', 'ok'); drawArea(); drawStream(); } catch (e) { toast(e.message, 'bad'); }
    };
    function drawArea() {
      if (kind === 'note') {
        const text = h('textarea', { class: 'input', rows: 3, maxlength: 1000, placeholder: 'Announce something to your class…' });
        const go = h('button', { class: 'btn btn-main' }, 'Post');
        go.addEventListener('click', busy(go, post(() => ({ text: text.value }))));
        fill(area, text, h('div', { class: 'row end' }, go));
      } else if (kind === 'game') {
        const pin = h('input', { class: 'input', inputmode: 'numeric', maxlength: 6, placeholder: 'Game PIN (6 numbers)' });
        pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); });
        const text = h('input', { class: 'input', maxlength: 200, placeholder: 'A message (optional)' });
        const go = h('button', { class: 'btn btn-main' }, icon('play', { size: 16 }), 'Send to class');
        go.addEventListener('click', busy(go, post(() => ({ pin: pin.value, text: text.value, title: 'Live game' }))));
        fill(area, h('p', { class: 'muted small', style: { margin: 0 } }, 'Host a game, then send its PIN here. Or press "Send to a class" in the game lobby.'),
          pin, text, h('div', { class: 'row end' }, h('a', { class: 'btn', href: '/library' }, 'Host a quiz'), go));
      } else if (kind === 'homework') {
        const pick = h('select', { class: 'input' }, h('option', { value: '' }, 'Loading your quizzes…'));
        let quizzes = [];
        myQuizzes().then((qs) => { quizzes = qs; fill(pick, ...(qs.length ? qs.map((q) => h('option', { value: q.id }, q.title)) : [h('option', { value: '' }, 'Make a quiz first')])); }).catch(() => {});
        let days = 3;
        const seg = h('div', { class: 'row', style: { gap: '6px' } });
        const drawSeg = () => fill(seg, ...[[1, '1 day'], [3, '3 days'], [7, '1 week'], [14, '2 weeks']].map(([d, label]) =>
          h('button', { type: 'button', class: `chip${d === days ? ' is-on' : ''}`, onclick: () => { days = d; drawSeg(); } }, label)));
        drawSeg();
        const text = h('input', { class: 'input', maxlength: 200, placeholder: 'A message (optional)' });
        const go = h('button', { class: 'btn btn-main' }, icon('book', { size: 16 }), 'Set homework');
        go.addEventListener('click', busy(go, async () => {
          const q = quizzes.find((x) => x.id === pick.value);
          if (!q) { toast('Pick one of your quizzes', 'bad'); return; }
          try {
            const id = await hw.assign(q, { title: q.title, days });
            const item = await hw.getHomework(id);
            await cls.post(c.id, 'homework', { hwId: id, title: q.title, dueAt: (item && item.dueAt) || Date.now() + days * 86400000, text: text.value });
            toast('Homework set!', 'ok'); drawArea(); drawStream();
          } catch (e) { toast(e.message || 'Could not set homework', 'bad'); }
        }));
        fill(area, h('label', { class: 'field' }, h('span', {}, 'Quiz'), pick), h('div', { class: 'field' }, h('span', {}, 'Due in'), seg), text, h('div', { class: 'row end' }, go));
      } else {
        const q = h('input', { class: 'input', maxlength: 240, placeholder: 'Your question' });
        let right = 0;
        const opts = [h('input', { class: 'input', maxlength: 90, placeholder: 'Answer 1' }), h('input', { class: 'input', maxlength: 90, placeholder: 'Answer 2' }),
          h('input', { class: 'input', maxlength: 90, placeholder: 'Answer 3 (optional)' }), h('input', { class: 'input', maxlength: 90, placeholder: 'Answer 4 (optional)' })];
        const rows = h('div', { class: 'stack', style: { gap: '8px' } });
        const drawRows = () => fill(rows, ...opts.map((o, i) => h('div', { class: 'row cls-q-edit' },
          h('button', { type: 'button', class: `cls-right${i === right ? ' is-on' : ''}`, title: 'The right answer', 'aria-label': `Answer ${i + 1} is right`, onclick: () => { right = i; drawRows(); } }, icon('check', { size: 14 })), o)));
        drawRows();
        const go = h('button', { class: 'btn btn-main' }, icon('hash', { size: 16 }), 'Ask the class');
        go.addEventListener('click', busy(go, post(() => {
          const filled = opts.map((o) => o.value.trim());
          const kept = filled.map((v, i) => [v, i]).filter(([v]) => v);
          return { text: q.value, options: kept.map(([v]) => v), answer: kept.findIndex(([, i]) => i === right) };
        })));
        fill(area, h('p', { class: 'muted small', style: { margin: 0 } }, 'One question. Tap the tick next to the right answer. Students answer once and see if they were right.'), q, rows, h('div', { class: 'row end' }, go));
      }
    }
    drawTabs(); drawArea();
    const me2 = session.myProfile() || {};
    return h('section', { class: 'card cls-compose stack' },
      h('div', { class: 'cls-compose-head' }, blook(me2.blook || 'owl', 38), h('div', {}, h('b', {}, 'Share with your class'), h('small', { class: 'muted' }, 'Everyone in the class sees it right away.'))),
      tabs, area);
  }

  /* -------------------------------------------------------------- the side */
  async function drawSide() {
    const list = await cls.people(c.id);
    const studs = list.filter((p) => p.role !== 'teacher').sort((a, b) => a.name.localeCompare(b.name));
    const teachers = list.filter((p) => p.role === 'teacher');
    const codeBox = teacher ? h('div', { class: 'card cls-codecard' },
      h('small', {}, 'Class code'),
      h('b', { class: 'cls-code' }, c.code),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: () => copy(c.code, 'Class code copied') }, icon('copy', { size: 14 }), 'Copy'),
        h('button', { class: 'btn btn-sm', onclick: () => changeCode() }, icon('edit', { size: 14 }), 'Change')),
      h('small', { class: 'muted' }, `Students go to ${mainHost()}/classes and type it.`)) : null;
    const add = teacher ? h('button', { class: 'btn btn-sm btn-main', onclick: () => addDialog() }, icon('plus', { size: 14 }), 'Add people') : null;
    const personRow = (p) => h('li', { class: 'cls-person' },
      blook(p.blook || 'fox', 32),
      h('a', { class: 'grow', href: p.username ? `/u/${p.username}` : null }, h('b', {}, p.name), p.username ? h('small', { class: 'muted' }, `@${p.username}`) : null),
      teacher && (p.role !== 'teacher' || c.owner === session.me().uid) ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', title: 'Remove', 'aria-label': `Remove ${p.name}`, onclick: async () => {
        if (!(await confirm({ title: `Remove ${p.name}?`, text: 'They can join again with the class code.', yes: 'Remove', danger: true }))) return;
        try { await cls.removePerson(c, p.id); await reload(); drawSide(); } catch (e) { toast(e.message || 'Could not remove', 'bad'); }
      } }, icon('close', { size: 14 })) : null);
    fill(side, codeBox,
      h('div', { class: 'card stack cls-people' },
        h('div', { class: 'row' }, h('h3', { class: 'grow', style: { margin: 0 } }, 'Teachers')),
        h('ul', {}, h('li', { class: 'cls-person' }, blook('owl', 32), h('div', { class: 'grow' }, h('b', {}, c.ownerName), h('small', { class: 'muted' }, 'Class owner'))), ...teachers.map(personRow)),
        h('div', { class: 'row' }, h('h3', { class: 'grow', style: { margin: 0 } }, `Students (${studs.length})`), add),
        studs.length ? h('ul', {}, ...studs.map(personRow)) : h('p', { class: 'muted small' }, teacher ? 'Give your students the class code, or add them by username.' : 'Nobody else yet.')),
      teacher && c.owner === session.me().uid ? h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: () => editDialog() }, icon('edit', { size: 14 }), 'Edit class'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => removeClass() }, icon('trash', { size: 14 }), 'Delete class')) : null,
      !teacher ? h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
        if (!(await confirm({ title: `Leave ${c.name}?`, yes: 'Leave', danger: true }))) return;
        await cls.leave(c).catch(() => {}); navigate('/classes');
      } }, 'Leave class') : null);
  }

  async function changeCode() {
    const next = await modal((close) => {
      const v = h('input', { class: 'input cl-code-input', maxlength: 10, value: c.code });
      v.addEventListener('input', () => { v.value = cls.cleanCode(v.value); });
      const go = h('button', { class: 'btn btn-main' }, 'Save code');
      go.addEventListener('click', busy(go, async () => { try { close(await cls.setCode(c, v.value)); } catch (e) { toast(e.message, 'bad'); } }));
      return [h('h2', {}, 'Class code'), h('p', { class: 'muted' }, 'Type your own code, or get a new random one. The old code stops working.'), v,
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { v.value = cls.randomCode(); } }, icon('shuffle', { size: 14 }), 'Random'), go)];
    });
    if (next) { c.code = next; toast('New class code saved', 'ok'); drawSide(); }
  }

  function addDialog() {
    return modal((close) => {
      let role = 'student';
      const name = h('input', { class: 'input', placeholder: '@username', autocomplete: 'off' });
      const seg = h('div', { class: 'row', style: { gap: '6px' } });
      const drawSeg = () => fill(seg, ...[['student', 'Student'], ...(c.owner === session.me().uid ? [['teacher', 'Teacher']] : [])].map(([k, label]) =>
        h('button', { type: 'button', class: `chip${k === role ? ' is-on' : ''}`, onclick: () => { role = k; drawSeg(); } }, label)));
      drawSeg();
      const go = h('button', { class: 'btn btn-main' }, icon('plus', { size: 16 }), 'Add');
      const added = h('ul', { class: 'cls-added' });
      const submit = busy(go, async () => {
        try {
          const p = await cls.addPerson(c, name.value, role);
          await reload();
          added.append(h('li', {}, icon('check', { size: 14 }), `${p.displayName || p.username} added`));
          name.value = ''; name.focus();
          drawSide();
        } catch (e) { toast(e.message, 'bad'); }
      });
      go.addEventListener('click', submit);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      return [h('h2', {}, 'Add people'), h('p', { class: 'muted' }, 'Add students, or other teachers who help run the class, by their Quickzy username.'),
        name, seg, added, h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Done'), go)];
    });
  }

  function editDialog() {
    return modal((close) => {
      const name = h('input', { class: 'input', maxlength: 60, value: c.name });
      const school = h('input', { class: 'input', maxlength: 80, value: c.school || '' });
      const go = h('button', { class: 'btn btn-main' }, 'Save');
      go.addEventListener('click', busy(go, async () => {
        try { await cls.renameClass(c, { name: name.value, school: school.value }); close(true); navigate(`/class/${c.id}`, { replace: true }); } catch (e) { toast(e.message, 'bad'); }
      }));
      return [h('h2', {}, 'Edit class'), h('label', { class: 'field' }, h('span', {}, 'Class name'), name), h('label', { class: 'field' }, h('span', {}, 'School'), school),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'), go)];
    });
  }

  async function removeClass() {
    if (!(await confirm({ title: `Delete ${c.name}?`, text: 'All its posts are deleted and the class code stops working.', yes: 'Delete class', danger: true }))) return;
    try { await cls.deleteClass(c); toast('Class deleted'); navigate('/classes', { replace: true }); } catch (e) { toast(e.message || 'Could not delete', 'bad'); }
  }

  drawStream(); drawSide();
  return h('div', { class: 'page stack', style: { gap: '18px' } },
    h('section', { class: 'cls-banner', style: { '--cls': colorOf(c) } },
      h('a', { class: 'cls-back', href: '/classes' }, icon('arrowLeft', { size: 16 }), 'Classes'),
      h('div', { class: 'cls-banner-art', 'aria-hidden': 'true' }, blook('owl', 92)),
      h('span', { class: 'cls-banner-tag' }, icon(teacher ? 'book' : 'users', { size: 14 }), teacher ? 'You teach this class' : 'Your class'),
      h('h1', {}, c.name),
      h('p', {}, `${c.ownerName}${c.school ? ` · ${c.school}` : ''} · ${plural((c.members || []).length, 'student')}`),
      null),
    h('div', { class: 'cls-layout' },
      h('div', { class: 'stack', style: { gap: '14px' } }, teacher ? composer() : null, stream),
      side));
}

/** From the game lobby: send this game's PIN to one of your classes. */
export async function sendPinDialog({ pin, title }) {
  const list = (await cls.myClasses()).filter(cls.teaches);
  return modal((close) => {
    if (!list.length) {
      return [h('h2', {}, 'Send to a class'), h('p', { class: 'muted' }, 'You have no classes yet.'),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Close'), h('a', { class: 'btn btn-main', href: '/classes?new=1', target: '_blank' }, 'Make a class'))];
    }
    const text = h('input', { class: 'input', maxlength: 200, placeholder: 'A message (optional)', value: 'Join the game now!' });
    return [h('h2', {}, 'Send the PIN to a class'), h('p', { class: 'muted' }, `Game ${pin.slice(0, 3)} ${pin.slice(3)} · ${title}`), text,
      h('div', { class: 'stack', style: { gap: '8px' } }, ...list.map((c) => {
        const b = h('button', { class: 'btn btn-block cls-send', style: { '--cls': colorOf(c) } }, h('i'), h('span', { class: 'grow' }, c.name), icon('arrowRight', { size: 16 }));
        b.addEventListener('click', busy(b, async () => {
          try { await cls.post(c.id, 'game', { pin, title, text: text.value }); toast(`Sent to ${c.name}`, 'ok'); close(true); } catch (e) { toast(e.message, 'bad'); }
        }));
        return b;
      })),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'))];
  });
}
