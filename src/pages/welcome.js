// welcome.js — the sign-up questions, asked once of every account (new and
// old; never of the creator): how did you find Quickzy, how old are you, and
// for grown-ups, is it for you or for teaching. Teachers pick their school.

import { h, fill } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { toast, busy } from '../ui/kit.js';
import { navigate } from '../router.js';
import * as session from '../services/session.js';
import { HEARD, saveAbout, knownSchools, join, useOf } from '../services/classes.js';
import { pageTitle } from './parts.js';
import { sfx } from '../game/sound.js';

// a picture and a colour for each "how did you find us" answer
const HEARD_LOOK = {
  friend: ['👋', '#ff4772'], teacher: ['🏫', '#6b4cff'], youtube: ['▶️', '#ff3b3b'], tiktok: ['🎵', '#17133f'],
  instagram: ['📸', '#e1306c'], search: ['🔎', '#2f9bff'], family: ['🏠', '#12c9a6'], other: ['✨', '#ff8a2a'],
};

const safe = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/welcome') ? next : '/');

export default async function Welcome({ query }) {
  pageTitle('Welcome to Quickzy');
  if (!session.signedIn()) { navigate('/signup', { replace: true }); return h('div'); }
  await session.whenProfile();
  const p = session.myProfile() || {};
  const next = safe(query.next);
  const answers = { heard: '', age: 0, use: '', school: '' };
  const box = h('div', { class: 'wl-card' });
  const dots = h('div', { class: 'wl-dots' });
  let steps = 3;

  const dot = (n) => fill(dots, ...Array.from({ length: steps }, (_, i) => h('i', { class: i < n ? 'is-on' : '' })));
  const head = (n, title, text) => {
    dot(n);
    return [h('span', { class: 'wl-step' }, `Question ${n} of ${steps}`), h('h1', {}, title), text ? h('p', { class: 'muted' }, text) : null];
  };
  const back = (to) => h('button', { class: 'btn btn-ghost btn-sm wl-back', type: 'button', onclick: to }, icon('arrowLeft', { size: 16 }), 'Back');

  /* 1. how did you find out about Quickzy? */
  function heard() {
    const choices = h('div', { class: 'wl-grid' }, ...HEARD.map(([id, label], i) => h('button', {
      type: 'button', class: `wl-choice${answers.heard === id ? ' is-on' : ''}`,
      style: { '--c': HEARD_LOOK[id][1], animationDelay: `${i * 0.04}s` },
      onclick: () => { answers.heard = id; sfx('pick'); age(); },
    }, h('span', { class: 'wl-emoji' }, HEARD_LOOK[id][0]), h('span', {}, label))));
    fill(box, ...head(1, 'How did you find out about Quickzy?', 'Tap one.'), choices);
  }

  /* 2. how old are you? */
  function age() {
    const n = h('input', { class: 'wl-age', type: 'number', inputmode: 'numeric', min: 4, max: 120, placeholder: '?', value: answers.age || '', 'aria-label': 'Your age' });
    const nudge = (d) => { const v = Math.max(4, Math.min(120, (Math.round(Number(n.value)) || 12) + d)); n.value = v; n.classList.remove('is-bad'); sfx('tap'); };
    const dial = h('div', { class: 'wl-dial' },
      h('button', { type: 'button', class: 'wl-step-btn', 'aria-label': 'Younger', onclick: () => nudge(-1) }, '−'),
      h('div', { class: 'wl-age-box' }, n, h('small', {}, 'years old')),
      h('button', { type: 'button', class: 'wl-step-btn', 'aria-label': 'Older', onclick: () => nudge(1) }, '+'));
    const go = h('button', { class: 'btn btn-main btn-lg btn-block' }, 'Next', icon('arrowRight', { size: 18 }));
    const submit = () => {
      const a = Math.round(Number(n.value));
      if (!(a >= 4 && a <= 120)) { n.classList.add('is-bad'); n.focus(); return; }
      answers.age = a;
      sfx('pick');
      if (a < 18) { answers.use = 'kid'; steps = 2; save(); } else { steps = 4; use(); }
    };
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    n.addEventListener('input', () => n.classList.remove('is-bad'));
    go.addEventListener('click', submit);
    steps = 3;
    fill(box, back(heard), ...head(2, 'How old are you?', 'This sets up the right Quickzy for you. Only you can see it.'), dial,
      h('p', { class: 'wl-lock' }, icon('lock', { size: 14 }), 'Private: never shown on your profile'), go);
    setTimeout(() => n.focus(), 50);
  }

  /* 3. grown-ups: for you, or for teaching? */
  function use() {
    const card = (id, ic, art, title, text) => h('button', { type: 'button', class: `wl-use wl-use-${id}${answers.use === id ? ' is-on' : ''}`, onclick: () => {
      answers.use = id; sfx('pick');
      if (id === 'teacher') school(); else save();
    } }, h('span', { class: 'wl-use-art' }, blook(art, 72)), h('b', {}, icon(ic, { size: 18 }), title), h('small', {}, text), h('span', { class: 'wl-use-go' }, 'Choose', icon('arrowRight', { size: 16 })));
    fill(box, back(age), ...head(3, 'What will you use Quickzy for?'),
      h('div', { class: 'wl-uses' },
        card('personal', 'user', 'fox', 'For me', 'Play games, make quizzes and collect blooks.'),
        card('teacher', 'book', 'owl', 'For teaching', 'Make classes, post announcements, set homework and send game codes to your students.')));
  }

  /* 4. teachers: which school? */
  function school() {
    const list = h('datalist', { id: 'wl-schools' });
    knownSchools().then((names) => fill(list, ...names.map((s) => h('option', { value: s })))).catch(() => {});
    const name = h('input', { class: 'input input-lg', list: 'wl-schools', maxlength: 80, placeholder: 'Start typing your school', value: answers.school, autocomplete: 'off' });
    const go = h('button', { class: 'btn btn-main btn-lg btn-block' }, icon('check', { size: 18 }), 'Done');
    const submit = () => {
      const s = name.value.trim();
      if (s.length < 2) { name.classList.add('is-bad'); name.focus(); return; }
      answers.school = s;
      save();
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    name.addEventListener('input', () => name.classList.remove('is-bad'));
    go.addEventListener('click', submit);
    fill(box, back(use), ...head(4, 'Which school do you teach at?', 'Pick it from the list, or type its name.'), name, list, go);
    setTimeout(() => name.focus(), 50);
  }

  async function save() {
    fill(box, h('div', { class: 'wl-saving' }, blook(p.blook || 'fox', 80), h('b', {}, 'Setting up your Quickzy…')));
    try {
      await saveAbout(answers);
      done();
    } catch (e) {
      console.warn(e);
      toast('That did not save. Check your connection and try again.', 'bad');
      answers.use = ''; heard();
    }
  }

  /* all set */
  function done() {
    dot(steps);
    sfx('reveal');
    import('../ui/confetti.js').then((m) => m.celebrate()).catch(() => {});
    if (useOf() === 'kid') {
      const code = h('input', { class: 'input wl-code', maxlength: 10, placeholder: 'Class code (if you have one)', autocomplete: 'off' });
      const joinBtn = h('button', { class: 'btn btn-main' }, 'Join class');
      joinBtn.addEventListener('click', busy(joinBtn, async () => {
        try { const cid = await join(code.value); toast('You joined the class!', 'ok'); navigate(`/class/${cid}`, { replace: true }); } catch (e) { toast(e.message, 'bad'); }
      }));
      fill(box, h('div', { class: 'wl-done' },
        h('div', { class: 'wl-blooks' }, ...['dragon', 'unicorn', p.blook || 'fox', 'astronaut', 'cupcake'].map((id) => blook(id, 58))),
        h('h1', {}, "You're all set!"),
        h('p', { class: 'muted' }, 'Collect blooks, open boxes, play games and join your class.'),
        h('div', { class: 'wl-links' },
          h('a', { class: 'wl-link', href: '/blooks' }, icon('star', { size: 20 }), h('b', {}, 'Open a box'), h('small', {}, 'Spend coins on new blooks')),
          h('a', { class: 'wl-link', href: '/join' }, icon('play', { size: 20 }), h('b', {}, 'Join a game'), h('small', {}, 'Type the game PIN')),
          h('a', { class: 'wl-link', href: '/discover' }, icon('compass', { size: 20 }), h('b', {}, 'Play solo'), h('small', {}, 'Quizzes to practise'))),
        h('div', { class: 'row wl-join' }, code, joinBtn),
        h('a', { class: 'btn btn-lg btn-block', href: next }, "Let's go", icon('arrowRight', { size: 18 }))));
      return;
    }
    if (useOf() === 'teacher') {
      fill(box, h('div', { class: 'wl-done' },
        h('div', { class: 'wl-blooks' }, blook('owl', 80)),
        h('h1', {}, 'Welcome, teacher!'),
        h('p', { class: 'muted' }, `Quickzy is ready for ${answers.school || 'your school'}. Make a class and give your students its code.`),
        h('a', { class: 'btn btn-main btn-lg btn-block', href: '/classes?new=1' }, icon('plus', { size: 18 }), 'Make my first class'),
        h('a', { class: 'btn btn-block', href: next }, 'Later')));
      return;
    }
    fill(box, h('div', { class: 'wl-done' },
      h('div', { class: 'wl-blooks' }, blook(p.blook || 'fox', 80)),
      h('h1', {}, "You're all set!"),
      h('p', { class: 'muted' }, 'Everything in Quickzy is ready for you.'),
      h('a', { class: 'btn btn-main btn-lg btn-block', href: next }, "Let's go", icon('arrowRight', { size: 18 }))));
  }

  if (useOf()) done(); else heard();
  const floaters = h('div', { class: 'wl-float', 'aria-hidden': 'true' }, ...['dragon', 'unicorn', 'robot', 'panda', 'astronaut', 'cupcake'].map((id, i) => h('span', { style: { '--i': i } }, blook(id, 54))));
  return h('div', { class: 'page wl-stage' }, floaters,
    h('div', { class: 'wl' },
      h('div', { class: 'wl-top' }, logo(), h('b', {}, 'Welcome to Quickzy'), dots),
      box));
}
