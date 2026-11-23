// app.js — the Quickzy app: play solo, anywhere, even with no internet.
//
// Pick a quiz (the Quickzy library ships inside the app; every quiz you have
// played online is kept too), pick one game mode, play. Install it from here
// and it opens like any other app on your phone or computer.

import { h, fill } from '../ui/dom.js';
import { icon, logo, wordmark } from '../ui/icons.js';
import { cover, pageTitle } from './parts.js';
import { navigate } from '../router.js';
import { library, savedQuizzes, removeOffline } from '../services/offline.js';
import { SOLO_MODES } from './practice.js';
import { sfx } from '../game/sound.js';

const BEST_KEY = 'quickzy.best';
const bests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } };

export default async function QuickzyApp() {
  pageTitle('Quickzy app');
  const lib = await library();
  let shelf = savedQuizzes().length ? 'mine' : 'library';
  let text = '';

  const status = h('span', { class: 'app-status' });
  const drawStatus = () => {
    const on = navigator.onLine;
    status.classList.toggle('is-off', !on);
    fill(status, h('i'), on ? 'Online' : 'Offline — still works');
  };
  addEventListener('online', drawStatus); addEventListener('offline', drawStatus);
  drawStatus();

  const installBtn = h('button', { class: 'app-install', type: 'button', hidden: true, onclick: () => import('../ui/install.js').then((m) => m.install()) }, icon('download', { size: 18 }), 'Install app');
  import('../ui/install.js').then((m) => { const d = () => { installBtn.hidden = !m.canInstall(); }; d(); m.onInstallChange(d); }).catch(() => {});

  // Windows computers can download the real desktop app (it isn't shown inside that app)
  const onWindows = /Windows/i.test(navigator.userAgent) && !/Electron/i.test(navigator.userAgent);
  const winBtn = onWindows ? h('a', { class: 'app-win', href: '/download/Quickzy-Windows.zip', download: 'Quickzy-Windows.zip', title: 'Open the zip, run Quickzy-Setup. If Windows says it protected your PC, choose More info, then Run anyway.' },
    h('span', { 'aria-hidden': 'true', innerHTML: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 5.5 10.5 4.5v7H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.3z"/></svg>' }), 'Download for Windows') : null;

  const tabs = h('div', { class: 'app-tabs', role: 'tablist' });
  const grid = h('div', { class: 'app-grid' });
  const search = h('input', { class: 'app-search', type: 'search', placeholder: 'Search quizzes', 'aria-label': 'Search quizzes', oninput: (e) => { text = e.target.value.trim().toLowerCase(); draw(); } });

  const tile = (item, mine) => {
    const q = item.quiz;
    const best = bests()[q.id];
    const el = h('button', { class: 'app-tile', type: 'button', onclick: () => { sfx('pick'); navigate(`/app/play/${encodeURIComponent(q.id)}`); } },
      cover(q),
      h('div', { class: 'app-tile-text' },
        h('b', {}, q.title),
        h('small', {}, `${q.questionCount || q.questions.length} questions`, best ? ` · best ${Number(best).toLocaleString()}` : '')));
    if (!mine) return el;
    const rm = h('button', { class: 'app-tile-rm', type: 'button', title: 'Remove from this device', 'aria-label': `Remove ${q.title}`, onclick: (e) => { e.stopPropagation(); removeOffline(q.id); draw(); } }, icon('close', { size: 14 }));
    return h('div', { class: 'app-tile-wrap' }, el, rm);
  };

  function draw() {
    const mine = savedQuizzes();
    fill(tabs,
      ...[['mine', `Your quizzes`, mine.length], ['library', 'Quickzy library', lib.length]].map(([id, label, n]) =>
        h('button', { type: 'button', role: 'tab', class: shelf === id ? 'is-on' : '', 'aria-selected': String(shelf === id), onclick: () => { shelf = id; draw(); } }, label, h('span', {}, String(n)))));
    const list = (shelf === 'mine' ? mine : lib).filter((x) => !text || `${x.quiz.title} ${x.quiz.description || ''}`.toLowerCase().includes(text));
    if (!list.length) {
      fill(grid, h('div', { class: 'app-empty' },
        shelf === 'mine' && !text
          ? [h('b', {}, 'No quizzes saved yet'), h('p', {}, 'Every quiz you play solo on Quickzy is saved here, so you can play it with no internet. Start with the Quickzy library.'),
            h('button', { class: 'btn btn-main', onclick: () => { shelf = 'library'; draw(); } }, 'Open the library')]
          : [h('b', {}, 'Nothing found'), h('p', {}, 'Try another word.')]));
      return;
    }
    fill(grid, ...list.map((x) => tile(x, shelf === 'mine')));
  }
  draw();

  const modes = h('div', { class: 'app-modes' }, ...SOLO_MODES.map(([, emoji, name, , col]) => h('span', { style: { '--c': col } }, h('i', {}, emoji), name)));

  return {
    el: h('div', { class: 'app-shell' },
      h('header', { class: 'app-bar' },
        h('a', { class: 'app-brand', href: '/app', 'aria-label': 'Quickzy app' }, logo(), wordmark()),
        status,
        h('div', { class: 'grow' }),
        winBtn,
        installBtn,
        h('a', { class: 'app-site', href: '/' }, 'quickzy.web.app', icon('up', { size: 14 }))),
      h('section', { class: 'app-hero' },
        h('div', { class: 'app-hero-text' },
          h('h1', {}, 'Play a quiz anywhere.'),
          h('p', {}, 'On the bus, on a plane, with no Wi-Fi. Pick a quiz, choose how you want to play, and go.'),
          modes),
        h('div', { class: 'app-hero-art', 'aria-hidden': 'true' },
          h('div', { class: 'app-phone' }, h('div', { class: 'app-phone-screen' }, h('span', { class: 'app-phone-logo' }, logo()), h('i'), h('i'), h('i'), h('i'))))),
      h('div', { class: 'app-tools' }, tabs, search),
      grid,
      h('footer', { class: 'app-foot' },
        h('span', {}, 'Live games, making quizzes and your blooks need the internet.'),
        h('a', { href: '/join' }, 'Join a live game'))),
    destroy() { removeEventListener('online', drawStatus); removeEventListener('offline', drawStatus); },
  };
}
